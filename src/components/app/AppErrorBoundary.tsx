import React from "react";
import { Button, Text, makeStyles, tokens } from "@fluentui/react-components";
import { FrontendErrorBase, readErrorMessage } from "../../common/errors.ts";

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
  readonly error: FrontendErrorBase | null;
}

/**
 * 将 React render 阶段未捕获异常收口成统一前端错误对象的应用级边界。
 */
export class AppErrorBoundary extends React.Component<
  IAppErrorBoundaryProps,
  IAppErrorBoundaryState
> {
  state: IAppErrorBoundaryState = {
    error: null,
  };

  /**
   * 当子树 render 抛错时，将异常立即收敛为可展示的稳定错误对象。
   */
  static getDerivedStateFromError(error: unknown): IAppErrorBoundaryState {
    if (error instanceof FrontendErrorBase) {
      return { error };
    }

    return {
      error: new FrontendErrorBase({
        name: "ReactRenderError",
        code: "renderError",
        category: "render",
        source: "react",
        message: readErrorMessage(
          error,
          "The application failed to render.",
        ),
        cause: error,
      }),
    };
  }

  /**
   * 仅用于开发调试输出，不在这里做业务分支。
   */
  componentDidCatch(error: Error): void {
    // 这里保留控制台输出，方便 Demo 使用者直接看到原始 render 堆栈。
    console.error("AppErrorBoundary caught a render error.", error);
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  render() {
    if (this.state.error) {
      return <ErrorFallback error={this.state.error} onReload={this.handleReload} />;
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
  error: FrontendErrorBase;
  onReload: () => void;
}) => {
  const styles = useStyles();

  return (
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
