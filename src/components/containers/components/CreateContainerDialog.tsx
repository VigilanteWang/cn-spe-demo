/**
 * 创建容器对话框模块
 *
 * 本模块负责：
 * 1. 展示创建容器所需的名称与描述输入框
 * 2. 管理创建中的 loading 状态
 * 3. 调用 spe.createContainer() 向后端发送创建请求
 * 4. 在成功后通过回调把新容器交还给页面入口组件
 *
 * 组件结构：
 *   <Dialog>
 *     <DialogSurface>
 *       <DialogBody>
 *         <DialogTitle />      ← 标题
 *         <DialogContent>      ← 名称输入、描述输入、Spinner
 *         <DialogActions>      ← Close / Create 按钮
 *       </DialogBody>
 *     </DialogSurface>
 *   </Dialog>
 *
 * 数据流：
 * - 父组件控制 open/onOpenChange
 * - 用户输入 name/description → 本组件内部 state
 * - 用户点击 Create → spe.createContainer()
 * - 创建成功 → onContainerCreated(newContainer) → 父组件更新容器列表与当前选中项
 **/

import { useState } from "react";
import type { ChangeEvent } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Input,
  InputOnChangeData,
  InputProps,
  Label,
  Spinner,
  makeStyles,
} from "@fluentui/react-components";
import { IContainer } from "../../../common/types";
import SpEmbedded from "../../../services/spembedded";

/** SpEmbedded 服务实例（全局单例），用于调用后端容器创建 API */
const spe = new SpEmbedded();

/**
 * 创建容器对话框内部样式
 *
 * - content: 表单区域的纵向排布与间距
 * - input: 输入框统一宽度，保持与页面容器选择器视觉一致
 **/
const useStyles = makeStyles({
  content: {
    display: "flex",
    flexDirection: "column",
    rowGap: "10px",
    marginBottom: "25px",
  },
  input: {
    width: "400px",
    maxWidth: "100%",
  },
});

/**
 * 创建容器弹窗属性。
 */
export interface ICreateContainerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onContainerCreated: (container: IContainer) => void;
}

/**
 * 创建容器弹窗
 *
 * @param open 对话框是否打开
 * @param onOpenChange 父组件传入的开关控制函数
 * @param onContainerCreated 创建成功后的回调
 *
 * 状态管理：
 * - name: 容器名称输入值
 * - description: 容器描述输入值
 * - creatingContainer: 是否正在创建容器（用于 Spinner 和按钮禁用）
 **/
export const CreateContainerDialog = ({
  open,
  onOpenChange,
  onContainerCreated,
}: ICreateContainerDialogProps) => {
  const styles = useStyles();

  // =============== 创建容器表单相关状态 ===============
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creatingContainer, setCreatingContainer] = useState(false);

  // =============== 表单输入处理 ===============
  /** 容器名称输入变化处理 */
  const handleNameChange: InputProps["onChange"] = (
    _event: ChangeEvent<HTMLInputElement>,
    data: InputOnChangeData,
  ) => {
    setName(data.value);
  };

  /** 容器描述输入变化处理 */
  const handleDescriptionChange: InputProps["onChange"] = (
    _event: ChangeEvent<HTMLInputElement>,
    data: InputOnChangeData,
  ) => {
    setDescription(data.value);
  };

  /**
   * 关闭对话框并清空表单
   *
   * 这样可以避免用户上一次未提交的输入内容残留到下一次打开。
   **/
  const closeDialog = () => {
    setName("");
    setDescription("");
    onOpenChange(false);
  };

  /**
   * 创建容器按钮点击处理
   *
   * 执行流程：
   * 1. 设置 loading 状态（显示 Spinner，禁用按钮）
   * 2. 调用 spe.createContainer() 发送创建请求到后端
   * 3. 成功：通过 onContainerCreated 把新容器交还给父组件，再关闭对话框
   * 4. 失败：保持对话框打开，但不向父组件回传任何容器
   * 5. 恢复 loading 状态
   **/
  const handleCreateClick = async () => {
    setCreatingContainer(true);

    try {
      const nextContainer = await spe.createContainer(name, description);

      if (!nextContainer) {
        return;
      }

      onContainerCreated(nextContainer);
      closeDialog();
    } finally {
      setCreatingContainer(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(_event, data) => {
        if (!data.open) {
          closeDialog();
          return;
        }

        onOpenChange(true);
      }}
    >
      <DialogSurface>
        <DialogBody>
          <DialogTitle>Create container</DialogTitle>
          <DialogContent className={styles.content}>
            <Label htmlFor="create-container-name">Container name:</Label>
            <Input
              id="create-container-name"
              className={styles.input}
              autoFocus
              required
              value={name}
              onChange={handleNameChange}
            />

            <Label htmlFor="create-container-description">
              Container description:
            </Label>
            <Input
              id="create-container-description"
              className={styles.input}
              value={description}
              onChange={handleDescriptionChange}
            />

            {/* 创建中显示 Spinner，帮助用户理解当前正在等待后端返回结果 */}
            {creatingContainer && (
              <Spinner
                size="medium"
                label="Creating container..."
                labelPosition="after"
              />
            )}
          </DialogContent>

          <DialogActions>
            {/* 关闭按钮：创建中禁用，避免在请求过程中打断交互状态 */}
            <Button appearance="secondary" onClick={closeDialog} disabled={creatingContainer}>
              Close
            </Button>
            {/* 创建按钮：name 为空或正在创建时禁用，避免空提交和重复提交 */}
            <Button
              appearance="primary"
              onClick={() => void handleCreateClick()}
              disabled={creatingContainer || name.trim() === ""}
            >
              Create
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
};
