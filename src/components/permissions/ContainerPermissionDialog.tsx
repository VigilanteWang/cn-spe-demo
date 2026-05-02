/**
 * 容器权限管理对话框模块
 *
 * 本模块负责：
 * 1. 提供“容器级权限管理”弹窗外壳
 * 2. 展示当前容器名称占位
 * 3. 展示权限页签、输入区、操作区和访问列表的静态占位
 * 4. 为后续接入真实 Graph 权限数据、TagPicker 和写回逻辑预留结构
 *
 * 组件结构：
 *   <Dialog>
 *     <DialogSurface>
 *       <DialogBody>
 *         <DialogTitle />      ← 标题
 *         <DialogContent>
 *           <Text />           ← 当前容器名占位
 *           <TabList />        ← 页签占位
 *           <Input />          ← 输入区占位
 *           <div />            ← 操作区占位
 *           <div />            ← 列表区占位
 *         </DialogContent>
 *         <DialogActions>      ← Apply / Close 按钮占位
 *       </DialogBody>
 *     </DialogSurface>
 *   </Dialog>
 *
 * 说明：
 * - 第 1 步只提供结构骨架。
 * - 本组件不请求真实权限数据，不做搜索，不做写回，也不编辑访问列表。
 **/

import { useState } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Input,
  Label,
  Tab,
  TabList,
  Text,
} from "@fluentui/react-components";
import { IContainerPermissionDialogProps } from "./permissionsTypes";
import { usePermissionsStyles } from "./permissionsStyles";

/**
 * 容器权限管理弹窗
 *
 * @param open 对话框是否打开
 * @param containerName 当前选中的容器名称；未选择容器时显示占位文案
 * @param onClose 关闭弹窗的回调
 *
 * 状态管理：
 * - selectedTab: 当前选中的占位页签。这里只用于呈现结构，不驱动任何权限逻辑。
 **/
export const ContainerPermissionDialog = ({
  open,
  containerName,
  onClose,
}: IContainerPermissionDialogProps) => {
  const styles = usePermissionsStyles();
  const [selectedTab, setSelectedTab] = useState("users");

  return (
    <Dialog
      open={open}
      onOpenChange={(_event, data) => !data.open && onClose()}
    >
      <DialogSurface>
        <DialogBody>
          <DialogTitle>Manage Container Permission</DialogTitle>

          <DialogContent className={styles.content}>
            {/* 当前容器说明区：先展示容器名和本步范围，帮助开发者明确这一步只是在搭框架 */}
            <div className={styles.section}>
              <Text weight="semibold">
                Container: {containerName ?? "未选择容器"}
              </Text>
              <Text>
                这里先保留容器级权限管理的弹窗框架，后续再接入真实 Graph
                权限数据。
              </Text>
            </div>

            {/* 权限页签占位：后续可以把不同权限视图或不同主体类型拆到各自页签里 */}
            <div className={styles.section}>
              <Label>Permission Tabs</Label>
              <TabList
                selectedValue={selectedTab}
                onTabSelect={(_event, data) =>
                  setSelectedTab(String(data.value))
                }
              >
                <Tab value="users">Users</Tab>
                <Tab value="groups">Groups</Tab>
              </TabList>
            </div>

            {/* 输入区占位：这里未来会接入 TagPicker、主体搜索和候选项选择逻辑 */}
            <div className={styles.section}>
              <Label htmlFor="permission-search-placeholder">
                Principal Input Placeholder
              </Label>
              <Input
                id="permission-search-placeholder"
                placeholder="TagPicker 和 Graph 搜索将在后续步骤接入"
                disabled
              />
            </div>

            {/* 操作区与列表区占位：本步先锁定信息架构和版面，不承载真实权限编辑行为 */}
            <div className={styles.section}>
              <Label>Permission List Placeholder</Label>
              <div className={styles.placeholderBox}>
                静态操作区占位：后续将在这里放置权限级别、批量操作和说明文本。
              </div>
              <div
                className={`${styles.placeholderBox} ${styles.listPlaceholder}`}
              >
                静态列表占位：后续将在这里渲染容器权限访问列表。
              </div>
            </div>
          </DialogContent>

          <DialogActions>
            {/* 当前 Close 只负责关窗，不触发任何数据保存 */}
            <Button appearance="secondary" onClick={onClose}>
              Close
            </Button>
            {/* 当前 Apply 仅保留按钮位，后续步骤再接入真实写回逻辑 */}
            <Button appearance="primary">Apply</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
};
