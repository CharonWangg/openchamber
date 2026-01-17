import React from 'react';
import type { Part } from '@opencode-ai/sdk/v2';
import { cn } from '@/lib/utils';
import {
    RiFileAddLine,
    RiFileEditLine,
    RiFileReduceLine,
    RiArrowDownSLine,
    RiArrowRightSLine,
    RiCheckLine,
    RiCloseLine,
    RiFileTextLine,
    RiExternalLinkLine
} from '@remixicon/react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { RuntimeAPIContext } from '@/contexts/runtimeAPIContext';
import type { ContentChangeReason } from '@/hooks/useChatScrollManager';

interface FileChange {
    path: string;
    status: 'added' | 'modified' | 'deleted' | 'renamed';
    oldPath?: string; // For renamed files
    stats?: {
        insertions?: number;
        deletions?: number;
    };
}

interface ChangeSummary {
    files: FileChange[];
    timestamp?: number;
}

type ChangeSummaryPart = Part & {
    type: 'change_summary';
    changeSummary?: ChangeSummary;
    synthetic?: boolean;
};

interface ChangeSummaryPartProps {
    part: ChangeSummaryPart;
    messageId: string;
    onContentChange?: (reason?: ContentChangeReason, messageId?: string) => void;
}

const getStatusIcon = (status: FileChange['status']) => {
    const iconClass = 'h-3.5 w-3.5 flex-shrink-0';
    switch (status) {
        case 'added':
            return <RiFileAddLine className={cn(iconClass, 'text-[color:var(--status-success)]')} />;
        case 'modified':
            return <RiFileEditLine className={cn(iconClass, 'text-[color:var(--status-info)]')} />;
        case 'deleted':
            return <RiFileReduceLine className={cn(iconClass, 'text-[color:var(--status-error)]')} />;
        case 'renamed':
            return <RiFileTextLine className={cn(iconClass, 'text-[color:var(--status-warning)]')} />;
        default:
            return <RiFileTextLine className={iconClass} />;
    }
};

const getStatusLabel = (status: FileChange['status']) => {
    switch (status) {
        case 'added':
            return 'Added';
        case 'modified':
            return 'Modified';
        case 'deleted':
            return 'Deleted';
        case 'renamed':
            return 'Renamed';
        default:
            return 'Changed';
    }
};

const getStatusColor = (status: FileChange['status']) => {
    switch (status) {
        case 'added':
            return 'text-[color:var(--status-success)]';
        case 'modified':
            return 'text-[color:var(--status-info)]';
        case 'deleted':
            return 'text-[color:var(--status-error)]';
        case 'renamed':
            return 'text-[color:var(--status-warning)]';
        default:
            return 'text-muted-foreground';
    }
};

const FileChangeItem: React.FC<{
    file: FileChange;
    onOpenFile: (path: string) => void;
    onOpenDiff: (path: string) => void;
}> = ({ file, onOpenFile, onOpenDiff }) => {
    const [isHovered, setIsHovered] = React.useState(false);

    const showDiffButton = file.status === 'modified' || file.status === 'renamed';
    const showOpenButton = file.status !== 'deleted';

    return (
        <div
            className={cn(
                'group/file flex items-center gap-2 px-3 py-2 rounded-lg transition-colors',
                'hover:bg-muted/30 border border-transparent hover:border-border/50'
            )}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <div className="flex items-center gap-2 flex-1 min-w-0">
                {getStatusIcon(file.status)}
                <div className="flex flex-col min-w-0 flex-1">
                    <div className="flex items-center gap-2 min-w-0">
                        <code className="text-sm font-mono text-foreground/90 truncate">
                            {file.path}
                        </code>
                        <span className={cn('text-xs typography-meta flex-shrink-0', getStatusColor(file.status))}>
                            {getStatusLabel(file.status)}
                        </span>
                    </div>
                    {file.oldPath && (
                        <code className="text-xs font-mono text-muted-foreground truncate">
                            Renamed from: {file.oldPath}
                        </code>
                    )}
                    {file.stats && (file.stats.insertions || file.stats.deletions) && (
                        <div className="flex items-center gap-2 text-xs typography-meta mt-0.5">
                            {file.stats.insertions !== undefined && file.stats.insertions > 0 && (
                                <span className="text-[color:var(--status-success)]">
                                    +{file.stats.insertions}
                                </span>
                            )}
                            {file.stats.deletions !== undefined && file.stats.deletions > 0 && (
                                <span className="text-[color:var(--status-error)]">
                                    -{file.stats.deletions}
                                </span>
                            )}
                        </div>
                    )}
                </div>
            </div>
            <div
                className={cn(
                    'flex items-center gap-1 opacity-0 pointer-events-none transition-opacity',
                    isHovered && 'opacity-100 pointer-events-auto'
                )}
            >
                {showDiffButton && (
                    <Tooltip delayDuration={500}>
                        <TooltipTrigger asChild>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onOpenDiff(file.path);
                                }}
                            >
                                <RiFileEditLine className="h-3.5 w-3.5" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent sideOffset={6}>View diff</TooltipContent>
                    </Tooltip>
                )}
                {showOpenButton && (
                    <Tooltip delayDuration={500}>
                        <TooltipTrigger asChild>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onOpenFile(file.path);
                                }}
                            >
                                <RiExternalLinkLine className="h-3.5 w-3.5" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent sideOffset={6}>Open file</TooltipContent>
                    </Tooltip>
                )}
            </div>
        </div>
    );
};

const ChangeSummaryPart: React.FC<ChangeSummaryPartProps> = ({ part, onContentChange }) => {
    const [isExpanded, setIsExpanded] = React.useState(true);
    const runtimeAPIs = React.useContext(RuntimeAPIContext);

    const changeSummary = part.changeSummary;

    if (!changeSummary || !changeSummary.files || changeSummary.files.length === 0) {
        return null;
    }

    const { files } = changeSummary;

    const groupedFiles = React.useMemo(() => {
        const groups: Record<string, FileChange[]> = {
            added: [],
            modified: [],
            deleted: [],
            renamed: [],
        };

        files.forEach((file) => {
            if (groups[file.status]) {
                groups[file.status].push(file);
            }
        });

        return groups;
    }, [files]);

    const totalChanges = files.length;
    const addedCount = groupedFiles.added.length;
    const modifiedCount = groupedFiles.modified.length;
    const deletedCount = groupedFiles.deleted.length;
    const renamedCount = groupedFiles.renamed.length;

    const handleOpenFile = React.useCallback((path: string) => {
        if (runtimeAPIs?.editor) {
            void runtimeAPIs.editor.openFile(path);
        }
    }, [runtimeAPIs]);

    const handleOpenDiff = React.useCallback((path: string) => {
        if (runtimeAPIs?.editor) {
            // For VSCode, we can use the openDiff API with HEAD as the original
            void runtimeAPIs.editor.openDiff(`HEAD:${path}`, path, `Changes in ${path}`);
        }
    }, [runtimeAPIs]);

    const toggleExpanded = React.useCallback(() => {
        setIsExpanded((prev) => !prev);
        // Notify parent about content change for scroll adjustment
        if (onContentChange) {
            setTimeout(() => {
                onContentChange('structural');
            }, 50);
        }
    }, [onContentChange]);

    return (
        <div className="my-3 border border-border/50 rounded-lg bg-muted/20 overflow-hidden">
            <button
                type="button"
                className={cn(
                    'w-full flex items-center justify-between gap-3 px-4 py-3',
                    'hover:bg-muted/30 transition-colors cursor-pointer',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50'
                )}
                onClick={toggleExpanded}
            >
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                        {isExpanded ? (
                            <RiArrowDownSLine className="h-4 w-4" />
                        ) : (
                            <RiArrowRightSLine className="h-4 w-4" />
                        )}
                        <span>Changes Summary</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs typography-meta">
                        {addedCount > 0 && (
                            <span className="flex items-center gap-1 text-[color:var(--status-success)]">
                                <RiCheckLine className="h-3 w-3" />
                                {addedCount}
                            </span>
                        )}
                        {modifiedCount > 0 && (
                            <span className="flex items-center gap-1 text-[color:var(--status-info)]">
                                <RiFileEditLine className="h-3 w-3" />
                                {modifiedCount}
                            </span>
                        )}
                        {deletedCount > 0 && (
                            <span className="flex items-center gap-1 text-[color:var(--status-error)]">
                                <RiCloseLine className="h-3 w-3" />
                                {deletedCount}
                            </span>
                        )}
                    </div>
                </div>
                <span className="text-xs text-muted-foreground typography-meta">
                    {totalChanges} {totalChanges === 1 ? 'file' : 'files'} changed
                </span>
            </button>

            {isExpanded && (
                <div className="border-t border-border/50 px-2 py-2">
                    <div className="flex flex-col gap-1">
                        {files.map((file, index) => (
                            <FileChangeItem
                                key={`${file.path}-${index}`}
                                file={file}
                                onOpenFile={handleOpenFile}
                                onOpenDiff={handleOpenDiff}
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default ChangeSummaryPart;
