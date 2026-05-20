import { Providers, ProviderState } from "@microsoft/mgt-element";
import { useEffect, useRef, useState } from "react";
import { FrontendUserActionError } from "../../../common/errors.ts";
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
  // 当前正在操作的是 People 还是 Groups  tab 。
  selectedTab: PermissionTabValue;

  // 两个 tab 各自的输入框内容，切 tab 后也能保留原来的输入。
  queryByTab: Record<PermissionTabValue, string>;

  // 把新的输入值写回到对应 tab 。
  setQuery: (tab: PermissionTabValue, value: string) => void;

  // 把选中的候选人加到权限列表里。
  addCandidate: (
    tab: PermissionTabValue,
    candidate: IPermissionPrincipalCandidate,
  ) => void;

  // 判断某个候选人是不是已经被加进列表了。
  isCandidateAdded: (
    tab: PermissionTabValue,
    candidate: IPermissionPrincipalCandidate,
  ) => boolean;

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
  // 当前 tab 里输入框展示的内容。
  // 这里直接返回当前 query，而不是让组件自己去读 queryByTab[selectedTab]，
  // 是为了把 Hook 对外抽象成“当前 tab 的完整搜索视图模型”。
  // 这样复用方只需要消费当前 query / results / status / handlers，
  // 不需要知道内部是按 tab 分桶保存输入值，降低对底层状态结构的耦合。
  query: string;

  // 当前 tab 已经搜索出来、可以展示在下拉列表里的候选项。
  results: IPermissionPrincipalCandidate[];

  // 当前搜索流程走到哪一步了，比如空闲、加载中、成功、失败。
  status: PermissionPrincipalSearchStatus;

  // 给 UI 的原始错误对象，调用方可以按统一错误体系做文案转换。
  searchError: unknown | null;

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
 * - 根据当前 tab 切换 People / Groups 搜索源
 * - 把目录搜索结果统一映射成 UI 候选项
 *
 * 角色编辑、删除、Apply / Close 草稿控制仍然由其他 Hook 负责。
 */
export const usePermissionPrincipalSearch = ({
  selectedTab,
  queryByTab,
  setQuery,
  addCandidate,
  isCandidateAdded,
  searchPrincipals = searchDirectoryPrincipals, // 使用默认实现，但允许外部覆盖
}: IUsePermissionPrincipalSearchOptions): IUsePermissionPrincipalSearchResult => {
  // 每个 tab 都维护自己的搜索结果，切换 tab 时不会互相覆盖。
  const [resultsByTab, setResultsByTab] = useState<
    Record<PermissionTabValue, IPermissionPrincipalCandidate[]>
  >({
    people: [],
    groups: [],
  });

  // 每个 tab 都保留独立状态，便于 UI 正确显示“加载中”或“空结果”。
  const [statusByTab, setStatusByTab] = useState<
    Record<PermissionTabValue, PermissionPrincipalSearchStatus>
  >({
    people: "idle",
    groups: "idle",
  });

  // 搜索错误按 tab 分别记录，避免一个 tab 的错误提示串到另一个 tab 。
  const [searchErrorByTab, setSearchErrorByTab] = useState<
    Record<PermissionTabValue, unknown | null>
  >({
    people: null,
    groups: null,
  });
  /**
   * 每次发起异步搜索时递增一个序号。useRef 除非组件卸载，否则一直保持同一个对象，
   * 所以这个序号在多次搜索中会持续递增。
   *
   * 这样晚返回的旧请求就不会把新请求的结果覆盖掉，
   * 能避免快速输入或切 tab 时出现“结果倒灌”。
   */
  const requestSequence = useRef(0);

  const currentQuery = queryByTab[selectedTab];
  const trimmedQuery = currentQuery.trim();

  useEffect(() => {
    // 输入为空时，回到最干净的初始状态，并清掉选中 tab 的旧结果，同时不影响其他 tab。
    if (trimmedQuery.length === 0) {
      setStatusByTab((currentStatus) => ({
        ...currentStatus,
        [selectedTab]: "idle",
      }));
      setResultsByTab((currentResults) => ({
        ...currentResults,
        [selectedTab]: [],
      }));
      setSearchErrorByTab((currentErrors) => ({
        ...currentErrors,
        [selectedTab]: null,
      }));
      return;
    }

    // 本步骤要求至少输入 3 个字符后才允许真正发起搜索。显示提示，还
    // 要把旧结果和错误清空
    if (trimmedQuery.length < MIN_SEARCH_QUERY_LENGTH) {
      setStatusByTab((currentStatus) => ({
        ...currentStatus,
        [selectedTab]: "waitingForMoreInput",
      }));
      setResultsByTab((currentResults) => ({
        ...currentResults,
        [selectedTab]: [],
      }));
      setSearchErrorByTab((currentErrors) => ({
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
        setSearchErrorByTab((currentErrors) => ({
          ...currentErrors,
          [selectedTab]: new FrontendUserActionError(
            "directorySearchNotSignedIn",
            "You are not signed in, so directory search is unavailable.",
          ),
        }));
        return;
      }

      const activeAccount = provider.getActiveAccount?.();
      // 为本次请求生成一个递增编号，后面用它识别“这是不是最新的一次搜索”。
      const requestId = requestSequence.current + 1;
      requestSequence.current = requestId;

      // 请求正式开始后，先把切换状态到 loading，并清掉上一次残留的错误提示。
      setStatusByTab((currentStatus) => ({
        ...currentStatus,
        [selectedTab]: "loading",
      }));
      setSearchErrorByTab((currentErrors) => ({
        ...currentErrors,
        [selectedTab]: null,
      }));

      // 带上当前账号和 tab 信息，发起本次目录搜索。
      void searchPrincipals({
        graphClient: provider.graph.client,
        tenantId: activeAccount?.tenantId ?? FALLBACK_TENANT_ID,
        accountId: activeAccount?.id ?? FALLBACK_ACCOUNT_ID,
        principalKind: selectedTab,
        query: trimmedQuery,
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

          // 用最新结果刷新当前 tab，并根据是否有结果决定显示 success 还是 empty。
          setResultsByTab((currentResults) => ({
            ...currentResults,
            [selectedTab]: mappedResults,
          }));
          setStatusByTab((currentStatus) => ({
            ...currentStatus,
            [selectedTab]: mappedResults.length > 0 ? "success" : "empty",
          }));
        })
        .catch((error: unknown) => {
          // 同样只处理最新请求，避免旧请求失败把新状态覆盖掉。
          if (requestSequence.current !== requestId) {
            return;
          }

          // 搜索失败时清空当前结果，并把状态和错误提示切到失败态。
          setResultsByTab((currentResults) => ({
            ...currentResults,
            [selectedTab]: [],
          }));
          setStatusByTab((currentStatus) => ({
            ...currentStatus,
            [selectedTab]: "error",
          }));
          setSearchErrorByTab((currentErrors) => ({
            ...currentErrors,
            [selectedTab]: error,
          }));
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      // 函数 return 给 React，在下一次 effect 执行前或组件卸载时调用。
      // 这里具体是，输入继续变化（trimmedQuery 变化，或其它依赖变化）或组件卸载时，清掉上一次尚未触发的 debounce 定时器。
      window.clearTimeout(timeoutId);
    };
  }, [searchPrincipals, selectedTab, trimmedQuery]);

  /**
   * 输入 query 变化时的 handler。
   */
  const handleQueryChange = (value: string) => {
    setQuery(selectedTab, value);
  };

  /**
   * 在搜索结果列表中，选中某个候选对象时的 handler。
   *
   * - 已存在：不重复添加
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

    if (isCandidateAdded(selectedTab, selectedCandidate)) {
      return;
    }

    // 成功添加后，主动清空当前搜索上下文，方便用户开始下一次搜索。
    addCandidate(selectedTab, selectedCandidate);
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
    searchError: searchErrorByTab[selectedTab],
    isDropdownOpen,
    handleQueryChange,
    handleCandidateSelect,
  };
};
