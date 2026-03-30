// microsoft graph scopes
export const GRAPH_USER_READ = "User.Read";
// Appraently these 3 scopes are not needed for the app to work
// only FileStorageContainer.Selected is needed, both application and delegated
// export const GRAPH_USER_READ_ALL = 'User.Read.All';
// export const GRAPH_FILES_READ_WRITE_ALL = 'Files.ReadWrite.All';
// export const GRAPH_SITES_READ_ALL = 'Sites.Read.All';
export const GRAPH_OPENID_CONNECT_BASIC = [
  "openid",
  "profile",
  "offline_access",
];

// SharePoint Embedded scopes
export const SPEMBEDDED_CONTAINER_MANAGE = "Container.Manage";
export const SPEMBEDDED_FILESTORAGECONTAINER_SELECTED =
  "FileStorageContainer.Selected";
