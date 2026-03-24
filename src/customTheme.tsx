import {
  webLightTheme,
  tokens,
  BrandVariants,
  Theme,
} from "@fluentui/react-components";

// 创建自定义主题，将 colorNeutralBackground1 替换为 colorNeutralBackground3
export const customTheme: Theme = {
  ...webLightTheme,
  colorNeutralBackground1: tokens.colorNeutralBackground3,
};
