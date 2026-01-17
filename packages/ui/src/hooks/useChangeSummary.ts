import { useEffect, useRef } from 'react';
import { useSessionStore } from '@/stores/useSessionStore';
import { getRegisteredRuntimeAPIs } from '@/contexts/runtimeAPIRegistry';
import type { Part } from '@opencode-ai/sdk/v2';
import type { GitStatus } from '@/lib/api/types';

interface FileChange {
    path: string;
    status: 'added' | 'modified' | 'deleted' | 'renamed';
    oldPath?: string;
    stats?: {
        insertions?: number;
        deletions?: number;
    };
}

interface ChangeSummary {
    files: FileChange[];
    timestamp?: number;
}

// Convert git status characters to file status
const parseGitStatus = (index: string, working_dir: string): 'added' | 'modified' | 'deleted' | 'renamed' | null => {
    // Prioritize index status over working directory status
    const status = index !== ' ' ? index : working_dir;

    switch (status) {
        case 'A':
            return 'added';
        case 'M':
            return 'modified';
        case 'D':
            return 'deleted';
        case 'R':
            return 'renamed';
        case '?':
            // Untracked files count as added
            return 'added';
        default:
            return null;
    }
};

// Convert GitStatus to ChangeSummary
const convertGitStatusToChangeSummary = (gitStatus: GitStatus): ChangeSummary | null => {
    if (!gitStatus.files || gitStatus.files.length === 0) {
        return null;
    }

    const files: FileChange[] = [];

    for (const file of gitStatus.files) {
        const status = parseGitStatus(file.index, file.working_dir);
        if (!status) continue;

        const stats = gitStatus.diffStats?.[file.path];

        files.push({
            path: file.path,
            status,
            stats: stats ? {
                insertions: stats.insertions,
                deletions: stats.deletions,
            } : undefined,
        });
    }

    if (files.length === 0) {
        return null;
    }

    return {
        files,
        timestamp: Date.now(),
    };
};

// Fetch git status from runtime API
const fetchGitStatus = async (directory: string): Promise<GitStatus | null> => {
    try {
        const runtimeAPIs = getRegisteredRuntimeAPIs();
        if (!runtimeAPIs?.git) {
            console.warn('[useChangeSummary] Git API not available');
            return null;
        }

        // Use the git API to get status
        const status = await runtimeAPIs.git.getStatus(directory);
        return status;
    } catch (error) {
        console.error('[useChangeSummary] Failed to fetch git status:', error);
        return null;
    }
};

// Track which messages have already had change summaries added
const processedMessages = new Set<string>();

export const useChangeSummary = (sessionId: string | null, workingDirectory: string | null) => {
    const addPartToMessage = useSessionStore((state) => state.addPartToMessage);
    const messages = useSessionStore((state) => (sessionId ? state.messages.get(sessionId) : null));

    // Track the last message that we know about
    const lastMessageIdRef = useRef<string | null>(null);
    const processingRef = useRef<boolean>(false);

    useEffect(() => {
        if (!sessionId || !workingDirectory) return;
        if (!messages || messages.length === 0) return;

        // Get the last assistant message
        const lastMessage = messages[messages.length - 1];
        if (!lastMessage) return;

        // Only process assistant messages
        if (lastMessage.info.role !== 'assistant') return;

        // Check if this is a new message or if we've already processed it
        const messageId = lastMessage.info.id;
        if (!messageId) return;

        // Skip if we've already processed this message
        if (processedMessages.has(messageId)) return;

        // Skip if this is the same message we already know about
        if (lastMessageIdRef.current === messageId) return;

        // Update our tracking
        lastMessageIdRef.current = messageId;

        // Check if the message is complete (has finish status)
        const finish = lastMessage.info.finish;
        if (!finish || finish !== 'stop') return;

        // Check if the message already has a change_summary part
        const hasChangeSummary = lastMessage.parts.some((part: Part) => part.type === 'change_summary');
        if (hasChangeSummary) {
            processedMessages.add(messageId);
            return;
        }

        // Avoid processing the same message multiple times concurrently
        if (processingRef.current) return;
        processingRef.current = true;

        // Wait a short moment to ensure all tool calls have completed
        const timeoutId = setTimeout(async () => {
            try {
                // Fetch current git status
                const gitStatus = await fetchGitStatus(workingDirectory);
                if (!gitStatus || gitStatus.isClean) {
                    console.log('[useChangeSummary] No changes detected');
                    processedMessages.add(messageId);
                    processingRef.current = false;
                    return;
                }

                // Convert git status to change summary
                const changeSummary = convertGitStatusToChangeSummary(gitStatus);
                if (!changeSummary || changeSummary.files.length === 0) {
                    console.log('[useChangeSummary] No file changes to summarize');
                    processedMessages.add(messageId);
                    processingRef.current = false;
                    return;
                }

                // Create a synthetic change_summary part
                const changeSummaryPart: Part = {
                    id: `change-summary-${messageId}-${Date.now()}`,
                    type: 'change_summary' as never, // Use 'as never' to bypass type checking
                    changeSummary,
                    synthetic: true,
                } as Part;

                // Add the part to the message
                console.log('[useChangeSummary] Adding change summary to message:', messageId, changeSummary);
                addPartToMessage(sessionId, messageId, changeSummaryPart);

                // Mark as processed
                processedMessages.add(messageId);
            } catch (error) {
                console.error('[useChangeSummary] Error adding change summary:', error);
            } finally {
                processingRef.current = false;
            }
        }, 1000); // Wait 1 second after message completion

        return () => {
            clearTimeout(timeoutId);
            processingRef.current = false;
        };
    }, [sessionId, workingDirectory, messages, addPartToMessage]);
};
