/**
 * 容器管理组件
 *
 * 功能概述：
 * 这是应用的主界面，允许用户：
 * 1. 从列表中选择一个已有的 SharePoint Embedded 容器
 * 2. 创建新的容器（提供名称和描述）
 * 3. 选择容器后，显示该容器内的文件管理界面（Files 组件）
 *
 * 组件关系：
 * ```
 * <Containers>
 *   ├─ <Dropdown>           // 容器选择下拉菜单
 *   ├─ <Dialog>             // 创建容器对话框
 *   └─ <Files> (conditional) // 选中容器后显示文件列表
 * </Containers>
 * ```
 *
 * 数据流：
 * 1. 组件挂载时：从后端加载容器列表 → 显示在下拉菜单中
 * 2. 用户选择容器：更新 selectedContainer ← 传递给 Files 组件
 * 3. 用户创建容器：通过 SpEmbedded 服务调用后端 → 新容器添加到列表
 *
 * 状态管理：
 * - 列表相关：containers[], selectedContainer
 * - 创建对话框：dialogOpen, name, description, creatingContainer
 * - UI 相关：useId() 生成的 HTML id（便于辅助功能）
 */

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

const spe = new SpEmbedded();

// ── Fluent UI 样式定义 ────────────────────────────────────────────────────
// 使用 makeStyles hook 定义所有样式，实现样式的类型安全和自动补全
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
 * Containers 组件
 *
 * @component
 * @param {any} props - 组件 props（当前未使用）
 * @returns {JSX.Element} 容器管理界面
 *
 * 主要功能：
 * 1. 加载和展示容器列表
 * 2. 允许用户从列表中选择容器
 * 3. 提供创建新容器的对话框
 * 4. 条件性渲染 Files 组件（用户选中容器时）
 *
 * 使用示例：
 * ```
 * <Containers />
 * ```
 */
export const Containers = (props: any) => {
  // ════════════════════════════════════════════════════════════════════════
  // 状态管理 - 容器列表和选择
  // ════════════════════════════════════════════════════════════════════════

  /**
   * 容器列表状态
   * - 初始值：空数组
   * - 更新时机：组件挂载时从后端加载，或用户创建新容器时
   * - 用途：填充下拉菜单的选项
   */
  const [containers, setContainers] = useState<IContainer[]>([]);

  /**
   * 当前选中的容器
   * - 初始值：undefined（未选择）
   * - 更新时机：用户在下拉菜单中选择容器
   * - 用途：传递给 Files 组件，显示容器内的文件
   */
  const [selectedContainer, setSelectedContainer] = useState<
    IContainer | undefined
  >(undefined);

  /**
   * 容器选择下拉菜单的 HTML ID
   * 由 useId() 生成唯一 ID，确保即使在同一页面有多个相同组件也不会冲突
   * 用于辅助功能（aria-labelledby 等）
   */
  const containerSelector = useId("containerSelector");

  // ════════════════════════════════════════════════════════════════════════
  // 状态管理 - 创建容器对话框
  // ════════════════════════════════════════════════════════════════════════

  /**
   * 对话框是否打开
   * - 初始值：false（对话框关闭）
   * - 更新时机：点击"创建容器"按钮时打开，完成或取消时关闭
   */
  const [dialogOpen, setDialogOpen] = useState(false);

  /**
   * 容器名称输入框的 HTML ID
   */
  const containerName = useId("containerName");

  /**
   * 容器名称输入框的值
   * - 初始值：空字符串
   * - 更新时机：用户在输入框输入时
   * - 用途：创建容器时作为 displayName 使用
   */
  const [name, setName] = useState("");

  /**
   * 容器描述输入框的 HTML ID
   */
  const containerDescription = useId("containerDescription");

  /**
   * 容器描述输入框的值
   * - 初始值：空字符串
   * - 更新时机：用户在输入框输入时
   * - 用途：创建容器时作为 description 使用
   */
  const [description, setDescription] = useState("");

  /**
   * 是否正在创建容器（加载中）
   * - 初始值：false
   * - 更新时机：
   *   * 用户点击"创建"按钮时设为 true
   *   * API 调用完成后设为 false
   * - 用途：
   *   * 显示/隐藏加载动画
   *   * 禁用对话框中的按钮，防止重复提交
   */
  const [creatingContainer, setCreatingContainer] = useState(false);

  // ════════════════════════════════════════════════════════════════════════
  // 副作用 Hook - 加载容器列表
  // ════════════════════════════════════════════════════════════════════════

  /**
   * 组件挂载时执行：从后端加载用户有权访问的容器列表
   *
   * 流程：
   * 1. 调用 SpEmbedded.listContainers() 获取容器列表
   * 2. 如果成功，更新 containers 状态
   * 3. 如果失败，容器列表保持为空
   *
   * 依赖数组为空 []，表示此副作用仅在组件挂载时执行一次
   */
  useEffect(() => {
    (async () => {
      const containers = await spe.listContainers();
      if (containers) {
        setContainers(containers);
      }
    })();
  }, []);

  // ════════════════════════════════════════════════════════════════════════
  // 事件处理器 - 容器选择
  // ════════════════════════════════════════════════════════════════════════

  /**
   * 下拉菜单选择变化时的回调
   *
   * 流程：
   * 1. 从事件数据中获取选中的容器 ID (data.optionValue)
   * 2. 在 containers 数组中查找该 ID 对应的容器对象
   * 3. 更新 selectedContainer 状态
   *
   * @param {SelectionEvents} event - Fluent UI 选择事件
   * @param {OptionOnSelectData} data - 选择数据，包含 optionValue（容器 ID）
   *
   * 设计注意：
   * - 使用 find() 而非直接返回 optionValue，因为后续需要完整的 IContainer 对象
   * - IContainer 对象包含 id, displayName, containerTypeId, createdDateTime 等信息
   */
  const onContainerDropdownChange = (
    event: SelectionEvents,
    data: OptionOnSelectData,
  ) => {
    const selected = containers.find(
      (container) => container.id === data.optionValue,
    );
    setSelectedContainer(selected);
  };

  // ════════════════════════════════════════════════════════════════════════
  // 事件处理器 - 创建容器对话框
  // ════════════════════════════════════════════════════════════════════════

  /**
   * 容器名称输入框变化时的回调
   *
   * 参数说明：
   * - event: HTML input 原生事件
   * - data: Fluent UI 的 InputOnChangeData，包含 value（新的输入值）
   *
   * 流程：
   * 1. 从 data.value 获取新输入
   * 2. 更新 name 状态
   *
   * @param {React.ChangeEvent<HTMLInputElement>} event - HTML 原生事件
   * @param {InputOnChangeData} data - Fluent UI 事件数据
   */
  const handleNameChange: InputProps["onChange"] = (
    event: React.ChangeEvent<HTMLInputElement>,
    data: InputOnChangeData,
  ): void => {
    setName(data?.value);
  };

  /**
   * 容器描述输入框变化时的回调
   *
   * @param {React.ChangeEvent<HTMLInputElement>} event - HTML 原生事件
   * @param {InputOnChangeData} data - Fluent UI 事件数据
   */
  const handleDescriptionChange: InputProps["onChange"] = (
    event: React.ChangeEvent<HTMLInputElement>,
    data: InputOnChangeData,
  ): void => {
    setDescription(data?.value);
  };

  /**
   * "创建容器"按钮点击时的回调
   *
   * 完整创建流程：
   * 1. 设置 creatingContainer = true（显示加载动画，禁用按钮）
   * 2. 调用 SpEmbedded.createContainer(name, description)
   * 3. 等待后端响应
   * 4. 成功情况：
   *    - 清空输入框（name, description）
   *    - 新容器添加到 containers 列表
   *    - 自动选中新容器（setSelectedContainer）
   *    - 关闭对话框
   * 5. 失败情况：
   *    - 清空输入框（避免用户看到之前的输入）
   *    - 保持对话框打开（不会自动关闭）
   * 6. 最后设置 creatingContainer = false（隐藏加载动画）
   *
   * @param {React.MouseEvent<HTMLButtonElement>} event - 按钮点击事件
   */
  const onContainerCreateClick = async (
    event: React.MouseEvent<HTMLButtonElement>,
  ): Promise<void> => {
    setCreatingContainer(true);

    // ── API 调用：创建容器 ─────────────────────────────────────────────────
    const newContainer = await spe.createContainer(name, description);

    if (newContainer) {
      // ── 成功：更新列表和状态 ──────────────────────────────────────────
      setName(""); // 清空输入框
      setDescription("");
      setContainers((current) => [...current, newContainer]); // 新容器加入列表
      setSelectedContainer(newContainer); // 自动选中新容器
      setDialogOpen(false); // 关闭对话框
    } else {
      // ── 失败：清空输入框，保持对话框打开 ──────────────────────────────
      setName("");
      setDescription("");
      // 对话框仍然打开，用户可以重试或修改输入
    }

    setCreatingContainer(false); // 停止加载动画
  };

  // ════════════════════════════════════════════════════════════════════════
  // 组件渲染
  // ════════════════════════════════════════════════════════════════════════

  const styles = useStyles();

  return (
    <div className={styles.root}>
      <div className={styles.containerSelector}>
        {/* ── 容器选择下拉菜单 ────────────────────────────────────────────────── */}
        {/* 
          从 containers 列表中渲染选项
          用户选择时触发 onContainerDropdownChange
        */}
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

        {/* ── 创建容器对话框 ────────────────────────────────────────────────────── */}
        <Dialog
          open={dialogOpen}
          onOpenChange={(event, data) => setDialogOpen(data.open)}
        >
          {/* 触发器：打开对话框的按钮 */}
          <DialogTrigger disableButtonEnhancement>
            <Button
              className={styles.containerSelectorControls}
              appearance="primary"
            >
              Create a new storage Container
            </Button>
          </DialogTrigger>

          {/* 对话框内容 */}
          <DialogSurface>
            <DialogBody>
              <DialogTitle>Create a new storage Container</DialogTitle>

              {/* 对话框表单 */}
              <DialogContent className={styles.dialogContent}>
                {/* 容器名称字段 - 必填 */}
                <Label htmlFor={containerName}>Container name:</Label>
                <Input
                  id={containerName}
                  className={styles.containerSelectorControls}
                  autoFocus
                  required
                  value={name}
                  onChange={handleNameChange}
                ></Input>

                {/* 容器描述字段 - 可选 */}
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

                {/* 加载动画 - 创建过程中显示 */}
                {creatingContainer && (
                  <Spinner
                    size="medium"
                    label="Creating storage Container..."
                    labelPosition="after"
                  />
                )}
              </DialogContent>

              {/* 对话框操作按钮 */}
              <DialogActions>
                {/* 取消按钮 - 创建中时禁用 */}
                <DialogTrigger disableButtonEnhancement>
                  <Button appearance="secondary" disabled={creatingContainer}>
                    Cancel
                  </Button>
                </DialogTrigger>

                {/* 创建按钮 - 条件：创建中或名称为空时禁用 */}
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

      {/* ── 文件管理界面 ────────────────────────────────────────────────────── */}
      {/* 
        条件渲染：只有当用户选中了容器时才显示 Files 组件
        Files 组件会显示该容器内的所有文件和文件夹
      */}
      {selectedContainer && <Files container={selectedContainer} />}
    </div>
  );
};

export default Containers;
