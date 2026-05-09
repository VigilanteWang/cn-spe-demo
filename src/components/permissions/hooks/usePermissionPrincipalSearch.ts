import { Providers, ProviderState } from "@microsoft/mgt-element";
import { useEffect, useRef, useState } from "react";
import {
  IPermissionPrincipalCandidate,
  PermissionTabValue,
} from "../models/permissionModels";
import { mapDirectorySearchResultToCandidate } from "../services/permissionPrincipalCandidateMapper";
import {
  type IDirectoryPrincipalSearchResult,
  searchDirectoryPrincipals,
  type ISearchDirectoryPrincipalsOptions,
} from "../services/directoryPrincipalSearch/directoryPrincipalSearch";

// debounce 的等待时间：用户停止输入 1 秒后，再真正发起一次目录搜索。
// 作用是减少频繁请求，避免每敲一个字就 call 一次 Graph。
const SEARCH_DEBOUNCE_MS = 1000;

// 最小搜索长度：少于 3 个字符时先不查，避免过短关键字带来太多无关结果。
const MIN_SEARCH_QUERY_LENGTH = 3;

// 当当前账号信息暂时拿不到时，给搜索请求一个兜底 tenantId。
const FALLBACK_TENANT_ID = "__mgt-active-tenant__";

// 当当前账号信息暂时拿不到时，给搜索请求一个兜底 accountId。
const FALLBACK_ACCOUNT_ID = "__mgt-active-account__";

/**
 * 权限弹窗里搜索框的状态机。
 *
 * - `idle`：输入为空，没有展示搜索结果
 * - `waitingForMoreInput`：用户已输入，但还没到最小搜索长度
 * - `debouncing`：已经满足最小长度，正在等待 debounce
 * - `loading / success / empty / error`：真实搜索生命周期
 */
type PermissionPrincipalSearchStatus =
  | "idle"
  | "waitingForMoreInput"
  | "debouncing"
  | "loading"
  | "success"
  | "empty"
  | "error";

/**
 * 目录搜索函数的统一签名。
 *
 * 这里把函数参数单独命名出来，不是因为 TypeScript 必须这样写，
 * 而是为了把“这个 Hook 依赖什么能力”说清楚。
 *
 * 这样做有几个好处：
 * - 代码里一眼能看出这里接收的是一个可替换的搜索函数
 * - 真正的 Graph 实现和测试里的假实现都可以复用同一份签名
 * - 如果以后搜索入参变化，只需要改这一处
 */
type SearchDirectoryPrincipalsFn = (
  options: ISearchDirectoryPrincipalsOptions,
) => Promise<IDirectoryPrincipalSearchResult[]>;

/**
 * `usePermissionPrincipalSearch` 的输入参数。
 *
 * 这个接口描述了 Hook 依赖外部提供的最小能力：
 * 它把“当前页面状态”和“外部动作能力”收进来，
 * 让 Hook 只负责搜索流程，不负责页面其他业务状态。
 */
interface IUsePermissionPrincipalSearchOptions {
  // 当前正在操作的是 People 还是 Groups 页签。
  selectedTab: PermissionTabValue;

  // 两个页签各自的输入框内容，切页签后也能保留原来的输入。
  queryByTab: Record<PermissionTabValue, string>;

  // 把新的输入值写回到对应页签。
  setQuery: (tab: PermissionTabValue, value: string) => void;

  // 把选中的候选人加到权限列表里。
  addCandidate: (
    tab: PermissionTabValue,
    candidate: IPermissionPrincipalCandidate,
  ) => void;

  // 判断某个候选人是不是已经被加进列表了。
  isCandidateAdded: (tab: PermissionTabValue, candidateId: string) => boolean;

  // 真正执行目录搜索的函数；不传时默认使用内置实现。
  searchPrincipals?: SearchDirectoryPrincipalsFn;
}

/**
 * `usePermissionPrincipalSearch` 暴露给组件层的状态和事件。
 *
 * 这个接口定义了组件最终能拿到什么：
 * 输入框的值、搜索结果、当前状态，以及两个用户交互处理函数。
 */
interface IUsePermissionPrincipalSearchResult {
  // 当前页签里输入框展示的内容。
  query: string;

  // 当前页签已经搜索出来、可以展示在下拉列表里的候选项。
  results: IPermissionPrincipalCandidate[];

  // 当前搜索流程走到哪一步了，比如空闲、加载中、成功、失败。
  status: PermissionPrincipalSearchStatus;

  // 给用户看的辅助提示，比如“这个人已经加过了”。
  feedbackMessage: string | null;

  // 给用户看的错误提示，比如未登录或搜索失败。
  errorMessage: string | null;

  // 是否应该展开下拉面板来显示搜索提示或结果。
  isDropdownOpen: boolean;

  // 用户在输入框里打字时调用。
  handleQueryChange: (value: string) => void;

  // 用户从下拉结果里选中某一项时调用。
  handleCandidateSelect: (candidateId: string | undefined) => void;
}

/**
 * 管理权限弹窗里“输入搜索词 -> debounce -> Graph 搜索 -> 选择后加入 access list”的完整流程。
 *
 * 这个 Hook 专注在搜索体验：
 * - 管理最小输入长度和 debounce
 * - 根据当前页签切换 People / Groups 搜索源
 * - 把目录搜索结果统一映射成 UI 候选项
 * - 处理重复添加反馈
 *
 * 角色编辑、删除、Apply / Close 草稿控制仍然由其他 Hook 负责。
 */
export const usePermissionPrincipalSearch = ({
  selectedTab,
  queryByTab,
  setQuery,
  addCandidate,
  isCandidateAdded,
  searchPrincipals = searchDirectoryPrincipals,
}: IUsePermissionPrincipalSearchOptions): IUsePermissionPrincipalSearchResult => {
  // 每个页签都维护自己的搜索结果，切换页签时不会互相覆盖。
  const [resultsByTab, setResultsByTab] = useState<
    Record<PermissionTabValue, IPermissionPrincipalCandidate[]>
  >({
    people: [],
    groups: [],
  });

  // 每个页签都保留独立状态，便于 UI 正确显示“加载中”或“空结果”。
  const [statusByTab, setStatusByTab] = useState<
    Record<PermissionTabValue, PermissionPrincipalSearchStatus>
  >({
    people: "idle",
    groups: "idle",
  });

  // 这个提示主要用于“重复添加”的场景。
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  // 搜索错误按页签分别记录，避免一个页签的错误提示串到另一个页签。
  const [errorMessageByTab, setErrorMessageByTab] = useState<
    Record<PermissionTabValue, string | null>
  >({
    people: null,
    groups: null,
  });

  /**
   * 每次发起异步搜索时递增一个序号。useRef 除非组件卸载，否则一直保持同一个对象，
   * 所以这个序号在多次搜索中会持续递增。
   *
   * 这样晚返回的旧请求就不会把新请求的结果覆盖掉，
   * 能避免快速输入或切页签时出现“结果倒灌”。
   */
  const requestSequence = useRef(0);

  const currentQuery = queryByTab[selectedTab];
  const trimmedQuery = currentQuery.trim();

  useEffect(() => {
    const normalizedQuery = currentQuery.trim();

    // 输入为空时，回到最干净的初始状态，并清掉当前页签的旧结果。
    if (normalizedQuery.length === 0) {
      setStatusByTab((currentStatus) => ({
        ...currentStatus,
        [selectedTab]: "idle",
      }));
      setResultsByTab((currentResults) => ({
        ...currentResults,
        [selectedTab]: [],
      }));
      setErrorMessageByTab((currentErrors) => ({
        ...currentErrors,
        [selectedTab]: null,
      }));
      return;
    }

    // 本步骤要求至少输入 3 个字符后才允许真正发起搜索。
    if (normalizedQuery.length < MIN_SEARCH_QUERY_LENGTH) {
      setStatusByTab((currentStatus) => ({
        ...currentStatus,
        [selectedTab]: "waitingForMoreInput",
      }));
      setResultsByTab((currentResults) => ({
        ...currentResults,
        [selectedTab]: [],
      }));
      setErrorMessageByTab((currentErrors) => ({
        ...currentErrors,
        [selectedTab]: null,
      }));
      return;
    }

    setStatusByTab((currentStatus) => ({
      ...currentStatus,
      [selectedTab]: "debouncing",
    }));

    // 用 setTimeout 实现 debounce：用户暂停输入一段时间后再真正发请求。
    const timeoutId = window.setTimeout(() => {
      const provider = Providers.globalProvider;

      // 真正发请求前再做一次登录态检查，避免直接调用 Graph 导致异常。
      if (
        !provider ||
        provider.state !== ProviderState.SignedIn ||
        !provider.graph?.client
      ) {
        setStatusByTab((currentStatus) => ({
          ...currentStatus,
          [selectedTab]: "error",
        }));
        setErrorMessageByTab((currentErrors) => ({
          ...currentErrors,
          [selectedTab]: "当前未登录，无法执行目录搜索。",
        }));
        return;
      }

      const activeAccount = provider.getActiveAccount?.();
      const requestId = requestSequence.current + 1;
      requestSequence.current = requestId;

      setStatusByTab((currentStatus) => ({
        ...currentStatus,
        [selectedTab]: "loading",
      }));
      setErrorMessageByTab((currentErrors) => ({
        ...currentErrors,
        [selectedTab]: null,
      }));

      void searchPrincipals({
        graphClient: provider.graph.client,
        tenantId: activeAccount?.tenantId ?? FALLBACK_TENANT_ID,
        accountId: activeAccount?.id ?? FALLBACK_ACCOUNT_ID,
        principalKind: selectedTab,
        query: normalizedQuery,
      })
        .then((results) => {
          // 如果这不是最新一次请求，说明用户又输入了新内容，旧结果直接丢弃。
          if (requestSequence.current !== requestId) {
            return;
          }

          // 服务层返回的是目录对象，先映射成当前 UI 可以直接消费的候选项。
          const mappedResults = results.map((result) =>
            mapDirectorySearchResultToCandidate(result, selectedTab),
          );

          setResultsByTab((currentResults) => ({
            ...currentResults,
            [selectedTab]: mappedResults,
          }));
          setStatusByTab((currentStatus) => ({
            ...currentStatus,
            [selectedTab]: mappedResults.length > 0 ? "success" : "empty",
          }));
        })
        .catch(() => {
          // 同样只处理最新请求，避免旧请求失败把新状态覆盖掉。
          if (requestSequence.current !== requestId) {
            return;
          }

          setResultsByTab((currentResults) => ({
            ...currentResults,
            [selectedTab]: [],
          }));
          setStatusByTab((currentStatus) => ({
            ...currentStatus,
            [selectedTab]: "error",
          }));
          setErrorMessageByTab((currentErrors) => ({
            ...currentErrors,
            [selectedTab]: "目录搜索失败，请稍后重试。",
          }));
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      // 输入继续变化或组件卸载时，清掉上一次尚未触发的 debounce 定时器。
      window.clearTimeout(timeoutId);
    };
  }, [currentQuery, searchPrincipals, selectedTab]);

  /**
   * 更新当前页签的输入值。
   *
   * 用户继续输入时，先清掉“重复添加”的提示，
   * 避免旧反馈残留在新的搜索过程里。
   */
  const handleQueryChange = (value: string) => {
    setFeedbackMessage(null);
    setQuery(selectedTab, value);
  };

  /**
   * 处理从下拉列表中选中某个候选对象。
   *
   * - 已存在：不给重复加，只提示一次
   * - 不存在：直接加入 access list，并清空输入
   */
  const handleCandidateSelect = (candidateId: string | undefined) => {
    if (!candidateId) {
      return;
    }

    // Combobox 只回传 id，这里再从当前结果列表里找回完整对象。
    const selectedCandidate = resultsByTab[selectedTab].find(
      (candidate) => candidate.id === candidateId,
    );

    if (!selectedCandidate) {
      return;
    }

    if (isCandidateAdded(selectedTab, candidateId)) {
      setFeedbackMessage(`${selectedCandidate.name} 已在 access list 中`);
      return;
    }

    // 成功添加后，主动清空当前搜索上下文，方便用户开始下一次搜索。
    addCandidate(selectedTab, selectedCandidate);
    setFeedbackMessage(null);
    setQuery(selectedTab, "");
    setResultsByTab((currentResults) => ({
      ...currentResults,
      [selectedTab]: [],
    }));
    setStatusByTab((currentStatus) => ({
      ...currentStatus,
      [selectedTab]: "idle",
    }));
  };

  // 只要用户已经输入内容，就保持下拉区打开，以便展示“继续输入”“加载中”“空态”等反馈。
  const isDropdownOpen = trimmedQuery.length > 0;

  return {
    query: currentQuery,
    results: resultsByTab[selectedTab],
    status: statusByTab[selectedTab],
    feedbackMessage,
    errorMessage: errorMessageByTab[selectedTab],
    isDropdownOpen,
    handleQueryChange,
    handleCandidateSelect,
  };
};
