import React, {
    useState,
    useEffect,
    useRef
} from 'react';
import { Providers } from "@microsoft/mgt-element";
import {
    AddRegular, ArrowUploadRegular,
    FolderRegular, DocumentRegular,
    SaveRegular, DeleteRegular,
} from '@fluentui/react-icons';
import {
    Button, Link, Label, Spinner,
    Input, InputProps, InputOnChangeData,
    Dialog, DialogActions, DialogContent, DialogBody, DialogSurface, DialogTitle, DialogTrigger,
    DataGrid, DataGridProps,
    DataGridHeader, DataGridHeaderCell,
    DataGridBody, DataGridRow,
    DataGridCell,
    TableColumnDefinition, createTableColumn,
    TableRowId,
    TableCellLayout,
    OnSelectionChangeData,
    SelectionItemId,
    Toolbar, ToolbarButton,
    makeStyles
} from "@fluentui/react-components";
import {
    DriveItem
} from "@microsoft/microsoft-graph-types-beta";
import { IContainer } from "./../common/IContainer";
require('isomorphic-fetch');

interface IFilesProps {
    container: IContainer;
}

interface IDriveItemExtended extends DriveItem {
    isFolder: boolean;
    modifiedByName: string;
    iconElement: JSX.Element;
    downloadUrl: string;
}

export const Files = (props: IFilesProps) => {

    const [driveItems, setDriveItems] = useState<IDriveItemExtended[]>([]);
    const [selectedRows, setSelectedRows] = useState<Set<SelectionItemId>>(new Set<TableRowId>([1]));
    const downloadLinkRef = useRef<HTMLAnchorElement>(null);
    // BOOKMARK 1 - constants & hooks
    useEffect(() => {
        (async () => {
            loadItems();
        })();
    }, [props]);

    const loadItems = async (itemId?: string) => {
        try {
            const graphClient = Providers.globalProvider.graph.client;
            const driveId = props.container.id;
            const driveItemId = itemId || 'root';

            // get Container items at current level
            const graphResponse = await graphClient.api(`/drives/${driveId}/items/${driveItemId}/children`).get();
            const containerItems: DriveItem[] = graphResponse.value as DriveItem[]
            const items: IDriveItemExtended[] = [];
            containerItems.forEach((driveItem: DriveItem) => {
                items.push({
                    ...driveItem,
                    isFolder: (driveItem.folder) ? true : false,
                    modifiedByName: (driveItem.lastModifiedBy?.user?.displayName) ? driveItem.lastModifiedBy!.user!.displayName : 'unknown',
                    iconElement: (driveItem.folder) ? <FolderRegular /> : <DocumentRegular />,
                    downloadUrl: (driveItem as any)['@microsoft.graph.downloadUrl']
                });
            });
            setDriveItems(items);
        } catch (error: any) {
            console.error(`Failed to load items: ${error.message}`);
        }
    };

    const onSelectionChange: DataGridProps["onSelectionChange"] = (event: React.MouseEvent | React.KeyboardEvent, data: OnSelectionChangeData): void => {
        setSelectedRows(data.selectedItems);
    }

    const onDownloadItemClick = (downloadUrl: string) => {
        const link = downloadLinkRef.current;
        link!.href = downloadUrl;
        link!.click();
    }

    // BOOKMARK 2 - handlers go here
    const columns: TableColumnDefinition<IDriveItemExtended>[] = [
        createTableColumn({
            columnId: 'driveItemName',
            renderHeaderCell: () => {
                return 'Name'
            },
            renderCell: (driveItem) => {
                return (
                    <TableCellLayout media={driveItem.iconElement}>
                        <Link href={driveItem!.webUrl!} target='_blank'>{driveItem.name}</Link>
                    </TableCellLayout>
                )
            }
        }),
        createTableColumn({
            columnId: 'lastModifiedTimestamp',
            renderHeaderCell: () => {
                return 'Last Modified'
            },
            renderCell: (driveItem) => {
                return (
                    <TableCellLayout>
                        {driveItem.lastModifiedDateTime}
                    </TableCellLayout>
                )
            }
        }),
        createTableColumn({
            columnId: 'lastModifiedBy',
            renderHeaderCell: () => {
                return 'Last Modified By'
            },
            renderCell: (driveItem) => {
                return (
                    <TableCellLayout>
                        {driveItem.modifiedByName}
                    </TableCellLayout>
                )
            }
        }),
        createTableColumn({
            columnId: 'actions',
            renderHeaderCell: () => {
                return 'Actions'
            },
            renderCell: (driveItem) => {
                return (
                    <>
                        <Button aria-label="Download"
                            disabled={!selectedRows.has(driveItem.id as string)}
                            icon={<SaveRegular />}
                            onClick={() => onDownloadItemClick(driveItem.downloadUrl)}>Download</Button>
                        <Button aria-label="Delete"
                            icon={<DeleteRegular />}>Delete</Button>
                    </>
                )
            }
        }),
    ];

    const columnSizingOptions = {
        driveItemName: {
            minWidth: 150,
            defaultWidth: 250,
            idealWidth: 200
        },
        lastModifiedTimestamp: {
            minWidth: 150,
            defaultWidth: 150
        },
        lastModifiedBy: {
            minWidth: 150,
            defaultWidth: 150
        },
        actions: {
            minWidth: 250,
            defaultWidth: 250
        }
    };
    // BOOKMARK 3 - component rendering return (
    return (
        <div>
            <a ref={downloadLinkRef} href="" target="_blank" style={{ display: 'none' }} />
            <DataGrid
                items={driveItems}
                columns={columns}
                getRowId={(item) => item.id}
                resizableColumns
                columnSizingOptions={columnSizingOptions}
                selectionMode='single'
                selectedItems={selectedRows}
                onSelectionChange={onSelectionChange}
            >
                <DataGridHeader>
                    <DataGridRow>
                        {({ renderHeaderCell }) => (
                            <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>
                        )}
                    </DataGridRow>
                </DataGridHeader>
                <DataGridBody<IDriveItemExtended>>
                    {({ item, rowId }) => (
                        <DataGridRow<IDriveItemExtended> key={rowId}>
                            {({ renderCell, columnId }) => (
                                <DataGridCell>
                                    {renderCell(item)}
                                </DataGridCell>
                            )}
                        </DataGridRow>
                    )}
                </DataGridBody>
            </DataGrid>
        </div>
    );
}

export default Files;