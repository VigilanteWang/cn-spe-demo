/**
 * 容器管理组件模块
 *
 * 本模块负责：
 * 1. 列出当前用户可访问的所有 SharePoint Embedded 存储容器
 * 2. 提供下拉框供用户选择容器
 * 3. 负责“创建容器”和“管理容器权限”两个弹窗的打开/关闭编排
 * 4. 选中容器后渲染 <Files /> 组件展示容器内文件
 *
 * 组件结构：
 *   <div root>
 *     <div headerSection>
 *       <Dropdown />                    ← 容器选择下拉框
 *       <div actionGroup>
 *         <Button />                    ← Create container 按钮
 *         <Button />                    ← Manage Container Permission 按钮
 *       </div>
 *     </div>
 *     <CreateContainerDialog />         ← 创建容器对话框
 *     <ContainerPermissionDialog />     ← 容器权限对话框骨架
 *     <Files container={selectedContainer} />  ← 仅在选中容器后渲染
 *   </div>
 *
 * 数据流：
 * - 组件初始化时调用 spe.listContainers() 获取容器列表
 * - 用户选择容器 → setSelectedContainer → 传递给 <Files />
 * - 用户创建容器 → 对话框内部调用 spe.createContainer() → 回调给本组件更新列表 + 自动选中新容器
 * - 用户点击管理权限 → 仅打开权限对话框骨架，本步不加载真实权限数据
 **/

import { useEffect, useState } from "react";
import { Button, Dropdown, Option } from "@fluentui/react-components";
import type {
  OptionOnSelectData,
  SelectionEvents,
} from "@fluentui/react-combobox";
import { IContainer } from "../../common/types";
import SpEmbedded from "../../services/spembedded";
import { Files } from "../files";
import { useContainersStyles } from "./containersStyles";
import { CreateContainerDialog } from "./components/CreateContainerDialog";
import { ContainerPermissionDialog } from "../permissions";

/** SpEmbedded 服务实例（全局单例），用于调用后端容器管理 API */
const spe = new SpEmbedded();

/**
 * Containers 组件属性接口（当前无属性，预留未来扩展）
 **/
interface IContainersProps {
  // 当前暂无属性需求；勿删除此接口，下一次需要新增属性时直接在此补充即可。
}

/**
 * 容器管理页面
 *
 * @param _props 组件属性（当前未使用具体属性）
 *
 * 状态管理：
 * - containers: 容器列表数据（从后端 API 获取）
 * - selectedContainer: 当前选中的容器（传递给 <Files /> 子组件）
 * - isCreateDialogOpen: 创建容器对话框是否打开
 * - isPermissionDialogOpen: 容器权限对话框是否打开
 *
 * 说明：
 * - 本组件现在只保留页面级职责：数据入口、页面编排、弹窗开关和文件区挂载。
 * - 创建容器的表单细节已经下沉到 CreateContainerDialog。
 * - 权限弹窗的静态骨架已经下沉到 ContainerPermissionDialog。
 **/
export const Containers = (_props: IContainersProps) => {
  const styles = useContainersStyles();

  // =============== 容器列表相关状态 ===============
  const [containers, setContainers] = useState<IContainer[]>([]);
  const [selectedContainer, setSelectedContainer] = useState<
    IContainer | undefined
  >(undefined);

  // =============== 页面弹窗开关状态 ===============
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isPermissionDialogOpen, setIsPermissionDialogOpen] = useState(false);

  // =============== 副作用：初始加载容器列表 ===============
  // 组件挂载时立即调用后端 API 获取容器列表
  useEffect(() => {
    (async () => {
      const nextContainers = await spe.listContainers();

      if (nextContainers) {
        setContainers(nextContainers);
      }
    })();
  }, []);

  /**
   * 下拉框选择变化处理：根据选中的 optionValue（容器 ID）查找并设置选中容器
   **/
  const handleContainerSelect = (
    _event: SelectionEvents,
    data: OptionOnSelectData,
  ) => {
    const nextSelectedContainer = containers.find(
      (container) => container.id === data.optionValue,
    );

    setSelectedContainer(nextSelectedContainer);
  };

  /**
   * 创建容器成功后的回调处理
   *
   * 执行流程：
   * 1. 将新容器追加到当前列表
   * 2. 自动把新容器设为当前选中容器
   * 3. Files 区域会因此自动切换到新容器上下文
   **/
  const handleContainerCreated = (container: IContainer) => {
    setContainers((currentContainers) => [...currentContainers, container]);
    setSelectedContainer(container);
  };

  return (
    <div className={styles.root} data-testid="containers-page">
      {/* ── 顶部容器控制区域：下拉框 + 创建按钮 + 权限按钮，整体左对齐 ── */}
      <div className={styles.headerSection} data-testid="containers-header">
        <div className={styles.controlsRow}>
          {/* 容器选择下拉框：每个 Option 的 value 是容器 ID，选中后触发 handleContainerSelect */}
          <Dropdown
            placeholder="Select a Storage Container"
            className={styles.containerDropdown}
            onOptionSelect={handleContainerSelect}
            data-testid="container-selector"
          >
            {containers.map((container) => (
              <Option key={container.id} value={container.id}>
                {container.displayName}
              </Option>
            ))}
          </Dropdown>

          {/* 操作按钮组：与容器选择器同一行排列，必要时允许换行，但逻辑上仍属于同一控制区 */}
          <div className={styles.actionGroup} data-testid="container-actions">
            <Button
              appearance="primary"
              onClick={() => setIsPermissionDialogOpen(true)}
            >
              Manage Permission
            </Button>
            <Button onClick={() => setIsCreateDialogOpen(true)}>
              Create container
            </Button>
          </div>
        </div>
      </div>

      {/* 创建容器对话框：页面层只控制开关，具体表单和创建流程在子组件内部 */}
      <CreateContainerDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onContainerCreated={handleContainerCreated}
      />

      {/* 容器权限对话框：本步只接入静态骨架，不做真实 Graph 权限读取或写回 */}
      <ContainerPermissionDialog
        open={isPermissionDialogOpen}
        containerName={selectedContainer?.displayName}
        onClose={() => setIsPermissionDialogOpen(false)}
      />

      {/* 仅在用户选中容器后才渲染文件列表组件，传入选中的容器对象 */}
      <div className={styles.filesRegion} data-testid="containers-files-region">
        {selectedContainer && <Files container={selectedContainer} />}
      </div>
    </div>
  );
};

export default Containers;
