/**
 * 容器管理组件模块
 *
 * 本模块负责：
 * 1. 列出当前用户可访问的所有 SharePoint Embedded 存储容器
 * 2. 提供下拉框供用户选择容器
 * 3. 提供"创建容器"对话框，支持输入名称和描述
 * 4. 选中容器后渲染 <Files /> 组件展示容器内文件
 *
 * 组件结构：
 *   <div root>
 *     <div containerSelector>
 *       <Dropdown />          ← 容器选择下拉框
 *       <Dialog>              ← 创建容器对话框
 *         <Button trigger />  ← "Create a new storage Container" 按钮
 *         <DialogSurface>     ← 对话框表面（名称、描述输入框 + 确认/取消按钮）
 *       </Dialog>
 *     </div>
 *     <Files container={selectedContainer} />  ← 仅在选中容器后渲染
 *   </div>
 *
 * 数据流：
 * - 组件初始化时调用 spe.listContainers() 获取容器列表
 * - 用户选择容器 → setSelectedContainer → 传递给 <Files />
 * - 用户创建容器 → spe.createContainer() → 更新列表 + 自动选中新容器
 **/

import React, { useEffect, useState } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogTrigger,
  Dropdown,
  Option,
  Input,
  InputProps,
  InputOnChangeData,
  Label,
  Spinner,
  makeStyles,
  shorthands,
  useId,
} from "@fluentui/react-components";
import type {
  OptionOnSelectData,
  SelectionEvents,
} from "@fluentui/react-combobox";
import { IContainer } from "../common/types";
import SpEmbedded from "../services/spembedded";
import { Files } from "./files";

/** SpEmbedded 服务实例（全局单例），用于调用后端容器管理 API */
const spe = new SpEmbedded();

/**
 * 组件样式定义
 *
 * 使用 Fluent UI makeStyles 定义局部 CSS-in-JS 样式：
 * - root: 页面根容器，垂直居中布局
 * - containerSelector: 下拉框和创建按钮的包裹区域
 * - containerSelectorControls: 下拉框、输入框和按钮的统一宽度（400px）
 * - dialogContent: 创建容器对话框内部表单区域的间距
 **/
const useStyles = makeStyles({
  root: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    ...shorthands.padding("25px"),
  },
  containerSelector: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    rowGap: "10px",
    ...shorthands.padding("25px"),
  },
  containerSelectorControls: {
    width: "400px",
  },
  dialogContent: {
    display: "flex",
    flexDirection: "column",
    rowGap: "10px",
    marginBottom: "25px",
  },
});

/**
 * Containers 组件属性接口（当前无属性，预留未来扩展）
 **/
interface IContainersProps {
  // 当前暂无属性需求；勿删除此接口，下一次需要新增属性时直接在此补充即可。
}

/**
 * 容器管理组件
 *
 * @param _props 组件属性（当前未使用具体属性）
 *
 * 状态管理：
 * - containers: 容器列表数据（从后端 API 获取）
 * - selectedContainer: 当前选中的容器（传递给 <Files /> 子组件）
 * - dialogOpen: 创建容器对话框是否打开
 * - name/description: 创建容器表单的输入值
 * - creatingContainer: 是否正在创建容器（用于 loading 状态和按鈕禁用）
 **/
export const Containers = (_props: IContainersProps) => {
  // =============== 容器列表相关状态 ===============
  const [containers, setContainers] = useState<IContainer[]>([]);
  const [selectedContainer, setSelectedContainer] = useState<
    IContainer | undefined
  >(undefined);
  const containerSelector = useId("containerSelector");

  // =============== 创建容器相关状态 ===============
  const [dialogOpen, setDialogOpen] = useState(false);
  const containerName = useId("containerName");
  const [name, setName] = useState("");
  const containerDescription = useId("containerDescription");
  const [description, setDescription] = useState("");
  const [creatingContainer, setCreatingContainer] = useState(false);
  // BOOKMARK 1 - constants & hooks

  // =============== 副作用：初始加载容器列表 ===============
  // 组件挂载时立即调用后端 API 获取容器列表
  useEffect(() => {
    (async () => {
      const containers = await spe.listContainers();
      if (containers) {
        setContainers(containers);
      }
    })();
  }, []);
  /**
   * 下拉框选择变化处理：根据选中的 optionValue（容器 ID）查找并设置选中容器
   **/
  const onContainerDropdownChange = (
    event: SelectionEvents,
    data: OptionOnSelectData,
  ) => {
    const selected = containers.find(
      (container) => container.id === data.optionValue,
    );
    setSelectedContainer(selected);
  };

  // =============== 创建容器表单处理 ===============
  /** 容器名称输入变化处理 */
  const handleNameChange: InputProps["onChange"] = (
    event: React.ChangeEvent<HTMLInputElement>,
    data: InputOnChangeData,
  ): void => {
    setName(data?.value);
  };

  /** 容器描述输入变化处理 */
  const handleDescriptionChange: InputProps["onChange"] = (
    event: React.ChangeEvent<HTMLInputElement>,
    data: InputOnChangeData,
  ): void => {
    setDescription(data?.value);
  };

  /**
   * 创建容器按钮点击处理
   *
   * 执行流程：
   * 1. 设置 loading 状态（显示 Spinner，禁用按钮）
   * 2. 调用 spe.createContainer() 发送创建请求到后端
   * 3. 成功：将新容器追加到列表，自动选中，关闭对话框
   * 4. 失败：仅清空输入（newContainer 为 undefined）
   * 5. 恢复 loading 状态
   **/
  const onContainerCreateClick = async (
    event: React.MouseEvent<HTMLButtonElement>,
  ): Promise<void> => {
    setCreatingContainer(true);
    const newContainer = await spe.createContainer(name, description);

    if (newContainer) {
      setName("");
      setDescription("");
      setContainers((current) => [...current, newContainer]);
      setSelectedContainer(newContainer);
      setDialogOpen(false);
    } else {
      setName("");
      setDescription("");
    }
    setCreatingContainer(false);
  };
  // BOOKMARK 2 - handlers go here

  // BOOKMARK 3 - component rendering
  const styles = useStyles();
  return (
    <div className={styles.root}>
      {/* ── 容器选择区域：下拉框 + 创建按钮 ── */}
      <div className={styles.containerSelector}>
        {/* 容器选择下拉框：每个 Option 的 value 是容器 ID，选中后触发 onContainerDropdownChange */}
        <Dropdown
          id={containerSelector}
          placeholder="Select a Storage Container"
          className={styles.containerSelectorControls}
          onOptionSelect={onContainerDropdownChange}
        >
          {containers.map((option) => (
            <Option key={option.id} value={option.id}>
              {option.displayName}
            </Option>
          ))}
        </Dropdown>
        {/* 创建容器对话框：由 DialogTrigger 按钮控制显隐，通过 dialogOpen 受控 */}
        <Dialog
          open={dialogOpen}
          onOpenChange={(event, data) => setDialogOpen(data.open)}
        >
          <DialogTrigger disableButtonEnhancement>
            <Button
              className={styles.containerSelectorControls}
              appearance="primary"
            >
              Create a new storage Container
            </Button>
          </DialogTrigger>

          <DialogSurface>
            <DialogBody>
              <DialogTitle>Create a new storage Container</DialogTitle>

              <DialogContent className={styles.dialogContent}>
                <Label htmlFor={containerName}>Container name:</Label>
                <Input
                  id={containerName}
                  className={styles.containerSelectorControls}
                  autoFocus
                  required
                  value={name}
                  onChange={handleNameChange}
                ></Input>
                <Label htmlFor={containerDescription}>
                  Container description:
                </Label>
                <Input
                  id={containerDescription}
                  className={styles.containerSelectorControls}
                  autoFocus
                  required
                  value={description}
                  onChange={handleDescriptionChange}
                ></Input>
                {creatingContainer && (
                  <Spinner
                    size="medium"
                    label="Creating storage Container..."
                    labelPosition="after"
                  />
                )}
              </DialogContent>

              <DialogActions>
                {/* 取消时通过 DialogTrigger 自动关闭对话框，不影响状态 */}
                <DialogTrigger disableButtonEnhancement>
                  <Button appearance="secondary" disabled={creatingContainer}>
                    Cancel
                  </Button>
                </DialogTrigger>
                {/* 创建按钮：name 为空或正在创建时禁用，避免重复提交 */}
                <Button
                  appearance="primary"
                  value={name}
                  onClick={onContainerCreateClick}
                  disabled={creatingContainer || name === ""}
                >
                  Create storage Container
                </Button>
              </DialogActions>
            </DialogBody>
          </DialogSurface>
        </Dialog>
      </div>
      {/* 仅在用户选中容器后才渲染文件列表组件，传入选中的容器对象 */}
      {selectedContainer && <Files container={selectedContainer} />}
    </div>
  );
};

export default Containers;
