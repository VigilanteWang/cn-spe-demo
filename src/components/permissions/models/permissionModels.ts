import type {
  IContainerPermissionEntryForUI,
} from "../../../../common/contracts/containerPermissionCommonContracts";
import type { PermissionEntriesByTab } from "./permissionSharedModels";
export type {
  IPermissionPrincipalCandidate,
  PermissionEntriesByTab,
  PermissionTabValue,
} from "./permissionSharedModels";

export type {
  ContainerPermissionRoleForUI as ContainerPermissionRole,
  IContainerPermissionEntryForUI as IContainerPermissionEntry,
} from "../../../../common/contracts/containerPermissionCommonContracts";
export type IContainerPermissionEntriesByTab =
  PermissionEntriesByTab<IContainerPermissionEntryForUI>;
