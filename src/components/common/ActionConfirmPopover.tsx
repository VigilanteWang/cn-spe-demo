import {
  Button,
  Popover,
  PopoverSurface,
  PopoverTrigger,
  Spinner,
  Text,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import {
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";

const useActionConfirmPopoverStyles = makeStyles({
  surface: {
    padding: tokens.spacingVerticalM,
    width: "min(280px, calc(100vw - 48px))",
    minWidth: "240px",
  },
  content: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    rowGap: tokens.spacingVerticalM,
  },
  contentBody: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "56px",
  },
  message: {
    lineHeight: tokens.lineHeightBase300,
    textAlign: "center",
  },
  actions: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
    marginTop: "auto",
  },
  pendingState: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    rowGap: tokens.spacingVerticalXS,
  },
  pendingLabel: {
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase200,
  },
});

/**
 * 通用确认 Popover 的属性。
 */
export interface IActionConfirmPopoverProps {
  /** 触发 Popover 的按钮或其他可交互元素。 */
  trigger: ReactElement<{ disabled?: boolean }>;
  /** 当前 Popover 是否打开。 */
  open: boolean;
  /** 打开状态变化时回传给外层。 */
  onOpenChange: (open: boolean) => void;
  /** 确认提示文案。 */
  message: ReactNode;
  /** 执行动作中的 loading 文案。 */
  loadingLabel: string;
  /** 当前动作是否正在执行。 */
  isPending: boolean;
  /** 确认执行动作。 */
  onConfirm: () => void;
  /** 是否禁用触发器。 */
  disabled?: boolean;
  /** 确认按钮文案。 */
  confirmText?: string;
  /** 取消按钮文案。 */
  cancelText?: string;
}

/**
 * 统一样式和 loading 体验的确认 Popover。
 *
 * 组件本身不持有打开状态和业务副作用，
 * 只负责把“确认前”和“执行中”两种界面稳定地展示出来。
 *
 * @param props 组件属性。
 * @returns 通用确认 Popover。
 */
export const ActionConfirmPopover = ({
  trigger,
  open,
  onOpenChange,
  message,
  loadingLabel,
  isPending,
  onConfirm,
  disabled = false,
  confirmText = "Yes",
  cancelText = "No",
}: IActionConfirmPopoverProps) => {
  const styles = useActionConfirmPopoverStyles();

  const mergedTrigger =
    isValidElement(trigger) && typeof disabled === "boolean"
      ? cloneElement(trigger, {
          disabled: trigger.props.disabled || disabled,
        })
      : trigger;

  return (
    <Popover
      open={open}
      onOpenChange={(_event, data) => {
        // 执行中保持浮层可见，避免用户在 loading 过程中误以为动作没有开始。
        if (!isPending) {
          onOpenChange(data.open);
        }
      }}
    >
      <PopoverTrigger disableButtonEnhancement>{mergedTrigger}</PopoverTrigger>
      <PopoverSurface className={styles.surface}>
        <div className={styles.content}>
          <div className={styles.contentBody}>
            {isPending ? (
              <div className={styles.pendingState}>
                <Spinner size="small" />
                <Text className={styles.pendingLabel}>{loadingLabel}</Text>
              </div>
            ) : (
              <Text className={styles.message}>{message}</Text>
            )}
          </div>
          <div className={styles.actions}>
            <Button
              size="small"
              appearance="secondary"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              {cancelText}
            </Button>
            <Button
              size="small"
              appearance="primary"
              onClick={onConfirm}
              disabled={isPending}
            >
              {confirmText}
            </Button>
          </div>
        </div>
      </PopoverSurface>
    </Popover>
  );
};
