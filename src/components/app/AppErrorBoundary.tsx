import React from "react";
import { Button, Text, makeStyles, tokens } from "@fluentui/react-components";
import {
  AppError,
  ensureErrorCause,
  readErrorMessage,
} from "../../../common/appError";

/**
 * 教学总览：
 * 1) 这个文件使用“类组件”实现 Error Boundary。
 *    React 目前仍要求通过类组件生命周期（getDerivedStateFromError / componentDidCatch）来做原生错误边界。
 * 2) Error Boundary 更像“组件树级别的 try/catch”，不是 DOM event listener。
 *    它不需要手动注册事件；只要把子树包在边界内，React 在渲染流程中会自动把错误上抛到最近边界。
 * 3) 调用阶段分工：
 *    - getDerivedStateFromError：Render Phase 调用，只负责根据错误计算下一次渲染状态（不能做副作用）。
 *    - componentDidCatch：Commit Phase 调用，适合做副作用（日志上报、埋点等）。
 * 4) 捕获范围（简化记忆）：
 *    - 能捕获：子组件 render、构造函数、生命周期中的同步异常。
 *    - 不能捕获：事件处理器、异步回调（setTimeout/Promise）、边界自身抛错。
 */

const useStyles = makeStyles({
  container: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalM,
    margin: "48px auto",
    padding: "24px",
    maxWidth: "720px",
    border: `1px solid ${tokens.colorPaletteRedBorder2}`,
    borderRadius: tokens.borderRadiusXLarge,
    backgroundColor: tokens.colorPaletteRedBackground1,
  },
  title: {
    color: tokens.colorPaletteRedForeground1,
  },
  message: {
    whiteSpace: "pre-wrap",
  },
});

interface IAppErrorBoundaryProps {
  readonly children: React.ReactNode;
}

interface IAppErrorBoundaryState {
  readonly error: AppError | null;
}

/**
 * 将 React render 阶段未捕获异常收口成统一前端错误对象的应用级边界。
 */
export class AppErrorBoundary extends React.Component<
  IAppErrorBoundaryProps,
  IAppErrorBoundaryState
> {
  // 约定：error 为 null 表示“正常渲染”；非 null 表示“切换到兜底 UI”。
  state: IAppErrorBoundaryState = {
    error: null,
  };

  /**
   * 当子树 render 抛错时，将异常立即收敛为可展示的稳定错误对象。
   * - 该方法属于 Render Phase，React 发现子树抛错后会立刻调用它。
   * - 这里应保持“纯函数”特征：只返回新 state，不做网络请求/埋点等副作用。
   * - 返回后的下一轮 render 会读取 state.error，从而渲染兜底界面。
   */
  static getDerivedStateFromError(error: unknown): IAppErrorBoundaryState {
    // 如果本来就是统一错误类型，直接复用，避免丢失上游语义。
    if (error instanceof AppError) {
      return { error };
    }

    // 对未知异常做归一化，保证 UI 层总能拿到稳定结构进行展示。
    return {
      error: new AppError({
        name: "ReactRenderError",
        code: "renderError",
        message: readErrorMessage(error, "The application failed to render."),
        originError: {
          source: "app",
          cause: ensureErrorCause(
            error,
            "The application failed to render.",
            "ReactRenderError",
          ),
        },
      }),
    };
  }

  /**
   * 仅用于开发调试输出，不在这里做业务分支。
   * - 该方法属于 Commit Phase。
   * - 与上面的 getDerivedStateFromError 配合：前者“决定显示什么”，这里“处理副作用”。
   * - 这里记录的是“被边界捕获到的错误”，常见用途是上报监控平台。
   */
  componentDidCatch(error: Error): void {
    // 这里保留控制台输出，方便 Demo 使用者直接看到原始 render 堆栈。
    console.error("AppErrorBoundary caught a render error.", error);
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  render() {
    // 一旦 state.error 存在，就短路正常子树渲染，改为显示兜底 UI，避免整页崩溃白屏。
    if (this.state.error) {
      return (
        <ErrorFallback error={this.state.error} onReload={this.handleReload} />
      );
    }

    return this.props.children;
  }
}

/**
 * 渲染应用级 render 错误的最小兜底界面。
 */
const ErrorFallback = ({
  error,
  onReload,
}: {
  error: AppError;
  onReload: () => void;
}) => {
  const styles = useStyles();
  return (
    // role="alert" 让辅助技术优先感知错误信息，提升可访问性。
    <div className={styles.container} role="alert">
      <Text size={500} weight="bold" className={styles.title}>
        Application render failed
      </Text>
      <Text className={styles.message}>{error.message}</Text>
      <Button appearance="primary" onClick={onReload}>
        Reload
      </Button>
    </div>
  );
};
