import { DriveItem } from "@microsoft/microsoft-graph-types-beta";

// Extended DriveItem with additional properties for UI
export interface IDriveItemExtended extends DriveItem {
  isFolder: boolean;
  modifiedByName: string;
  iconElement: JSX.Element;
  downloadUrl: string;
}

// Storage container interface
export interface IContainer {
  id: string;
  displayName: string;
  containerTypeId: string;
  createdDateTime: string;
}
