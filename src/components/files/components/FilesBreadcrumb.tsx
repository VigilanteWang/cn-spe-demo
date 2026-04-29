import React from "react";
import {
  Breadcrumb,
  BreadcrumbButton,
  BreadcrumbDivider,
  BreadcrumbItem,
} from "@fluentui/react-components";
import { ChevronRightRegular, HomeRegular } from "@fluentui/react-icons";
import { IFilesBreadcrumbItem } from "../filesTypes";

interface IFilesBreadcrumbProps {
  /** 当前面包屑路径。 */
  breadcrumbPath: IFilesBreadcrumbItem[];
  /** 面包屑点击事件。 */
  onBreadcrumbClick: (
    targetFolderId: string,
    targetFolderName: string,
  ) => Promise<void>;
}

/**
 * 文件夹面包屑导航组件。
 * @param props 组件属性。
 * @returns 面包屑导航 UI。
 */
export const FilesBreadcrumb = ({
  breadcrumbPath,
  onBreadcrumbClick,
}: IFilesBreadcrumbProps) => {
  return (
    <Breadcrumb>
      {breadcrumbPath.map((item, index) => (
        <React.Fragment key={item.id}>
          <BreadcrumbItem>
            <BreadcrumbButton
              icon={index === 0 ? <HomeRegular /> : undefined}
              onClick={() => void onBreadcrumbClick(item.id, item.name)}
              current={index === breadcrumbPath.length - 1}
            >
              {item.name}
            </BreadcrumbButton>
          </BreadcrumbItem>
          {index < breadcrumbPath.length - 1 && (
            <BreadcrumbDivider>
              <ChevronRightRegular />
            </BreadcrumbDivider>
          )}
        </React.Fragment>
      ))}
    </Breadcrumb>
  );
};
