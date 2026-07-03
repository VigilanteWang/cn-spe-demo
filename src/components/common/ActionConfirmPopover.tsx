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

  // 外层既可能通过 trigger 自己传 disabled，也可能通过通用确认组件统一禁用；
  // 无论禁用决定来自触发器自身，还是来自 ActionConfirmPopover 这一层，最终用户看到的按钮状态都一致。
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
        // 当前组件本身不持有 open state，因此这里只负责把这个“开关意图”
        // 转交给外层状态机，由外层更新 state 后再触发下一轮 render。
        // 执行中保持浮层可见，避免用户在 loading 过程中误以为动作没有开始。
        if (!isPending) {
          onOpenChange(data.open);
        }
      }}
    >
      <PopoverTrigger disableButtonEnhancement>{mergedTrigger}</PopoverTrigger>
      <PopoverSurface className={styles.surface}>
        <div className={styles.content}>
          {/* 正文区域只展示两种状态：确认提示，或动作执行中的 loading 反馈。 */}
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
          {/* 底部按钮区始终保留，执行中统一禁用，避免重复确认或中途取消造成状态混乱。 */}
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
