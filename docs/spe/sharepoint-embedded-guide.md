# SharePoint Embedded 核心概念指南

> 本文档帮助你在 **5-10 分钟** 内建立对 SharePoint Embedded（以下简称 SPE）的整体认知：它是什么、解决什么问题、关键对象之间如何协作、权限与计费如何运作、以及落地实施需要关注的关键步骤。
>
> 每节末尾附有 **Read more** 链接，指向微软官方原文或仓库文档，方便深入阅读。

---

## 目录

1. [一句话理解 SPE](#1-一句话理解-spe)
2. [核心概念与对象关系](#2-核心概念与对象关系)
3. [应用架构与租户模型](#3-应用架构与租户模型)
4. [认证与授权](#4-认证与授权)
5. [共享与权限管理](#5-共享与权限管理)
6. [Container Type 与计费](#6-container-type-与计费)
7. [实施路径速览](#7-实施路径速览)
8. [与普通 SharePoint 的关键区别](#8-与普通-sharepoint-的关键区别)
9. [常见误区](#9-常见误区)
10. [术语速查表](#10-术语速查表)
11. [扩展阅读地图](#11-扩展阅读地图)

---

## 1. 一句话理解 SPE

**SharePoint Embedded 是一个纯 API 驱动的文件与文档管理平台。** 它把 Microsoft 365 的存储、协作、合规能力"嵌入"到你自己的应用中，但 **不暴露任何 SharePoint 站点界面**。

类比理解：

| 传统 SharePoint | SharePoint Embedded |
|---|---|
| 你在 SharePoint 站点里创建"文档库（Document Library）"，用户通过站点 UI 访问文件 | 你的应用通过 Microsoft Graph（微软统一 API 网关）创建"File Storage Container（文件存储容器）"，用户通过你的应用 UI 访问文件 |
| 文件和站点都在同一租户内，由 SharePoint 管理员统一管理 | 文件仍在客户的 M365 租户内，但存放在一个独立分区（Partition），与 SharePoint 站点存储互不影响 |

> **关键点：** SPE 中的文档始终驻留在客户（消费方）的 M365 租户，开发者的应用只负责"读写"而非"持有"数据。

**Read more:**
- [Overview of SharePoint Embedded](https://learn.microsoft.com/en-us/sharepoint/dev/embedded/overview)
- [仓库入口 · docs/embedded](https://github.com/SharePoint/sp-dev-docs/tree/main/docs/embedded)

---

## 2. 核心概念与对象关系

SPE 体系中有几个必须理解的核心对象，下面用一张层级关系帮你快速建立心智模型：

```
Owning Tenant（开发租户）
  └── Application（应用，Entra ID 注册）
        └── Container Type（容器类型，1:1 绑定应用）
              └── [部署到 Consuming Tenant]
                    └── Container（容器实例，可创建多个）
                          ├── Files / Folders（文件与文件夹）
                          └── Permissions（成员与角色）
```

### 核心对象速解

- **Container（容器）**：SPE 最基本的存储单元，也是安全与合规的边界。可以类比为一个"仅通过 API 访问的文档库"。每个 Container 可以独立设置成员权限，存储多层级文件和文件夹。
- **Container Type（容器类型）**：定义了应用与一组 Container 之间的关系——包括访问权限、计费归属和行为配置。每个 Container Type 与一个 Owning Application（拥有应用）严格 1:1 绑定。
- **Owning Application（拥有应用）**：在 Microsoft Entra ID（原 Azure AD）中注册的应用，是 Container Type 的创建者和管理者。
- **Guest Application（来宾应用）**：经 Owning Application 授权后，也可以访问该 Container Type 下的容器（例如用于备份、审计等场景）。

**Read more:**
- [SharePoint Embedded app architecture](https://learn.microsoft.com/en-us/sharepoint/dev/embedded/development/app-architecture)
- [SharePoint Embedded container types](https://learn.microsoft.com/en-us/sharepoint/dev/embedded/getting-started/containertypes)

---

## 3. 应用架构与租户模型

### Owning Tenant 与 Consuming Tenant

SPE 引入了两个关键租户角色：

- **Owning Tenant（拥有租户/开发租户）**：创建和管理 Container Type 的租户。通常就是 ISV 或企业开发团队所在的 M365 租户。
- **Consuming Tenant（消费租户/客户租户）**：实际使用应用、存储文件的租户。所有 Container 和内容都存储在 Consuming Tenant 内部。

> 同一个租户可以同时充当 Owning Tenant 和 Consuming Tenant（例如企业内部自建 LOB 应用的场景）。

### 多应用架构

一个 Consuming Tenant 中可以部署多个 SPE 应用，每个应用只能访问自己 Container Type 对应的容器——**容器之间天然隔离**。不过也可以通过 Guest Application 机制让多个应用共享同一组容器。

#### 场景示例

> Contoso（ISV）开发了一款 HR 应用，部署到 Fabrikam 的租户。Fabrikam 同时也自建了一个审计应用。两个应用各自拥有独立的 Container Type，互不可见。Contoso 是 HR 应用的 Owning Tenant，Fabrikam 既是 HR 应用的 Consuming Tenant，也是审计应用的 Owning + Consuming Tenant。

**Read more:**
- [SharePoint Embedded app architecture](https://learn.microsoft.com/en-us/sharepoint/dev/embedded/development/app-architecture)
- [Install your SPE application for customers](https://learn.microsoft.com/en-us/sharepoint/dev/embedded/development/tutorials/vendor-install-app-customer)

---

## 4. 认证与授权

SPE 的认证授权体系分为 **三层**，理解这三层之间的关系是避免权限问题的关键。

### 第一层：Microsoft Graph 权限（应用清单级别）

应用需要在 Entra ID 注册中声明以下核心 Graph 权限：

| 权限 | 用途 | 需要时机 |
|---|---|---|
| `FileStorageContainerType.Manage.All` | 创建和管理 Container Type | 仅在 Owning Tenant 上需要 |
| `FileStorageContainerTypeReg.Selected` | 在 Consuming Tenant 注册 Container Type | 部署到客户租户时 |
| `FileStorageContainer.Selected` | 访问容器和内容 | Owning 和 Consuming Tenant 都需要 |

> **注意：** 创建 Container Type 后，应从应用清单中移除 `FileStorageContainerType.Manage.All`，避免客户对过度权限的担忧。

### 第二层：Container Type Application Permission（容器类型级别权限）

通过 Container Type Registration API（容器类型注册 API）配置，决定了应用对某个容器类型下所有容器能做什么操作。常用权限如下：

| 权限 | 说明 |
|---|---|
| `ReadContent` / `WriteContent` | 读/写容器内容 |
| `Create` / `Delete` | 创建/删除容器 |
| `ManagePermissions` | 管理容器成员 |
| `Full` | 拥有全部权限 |

> Graph 权限 + Container Type 权限的 **组合** 才构成完整的应用授权。

### 第三层：Container Permission（容器实例级别权限/用户角色）

当应用代表用户（Delegated/委托模式）访问容器时，用户必须是该容器的成员。成员权限通过角色授予：

| 角色 | 能力范围 |
|---|---|
| **Reader** | 只读容器属性和内容 |
| **Writer** | Reader 的全部能力 + 创建、更新、删除内容 |
| **Manager** | Writer 的全部能力 + 管理容器成员 |
| **Owner** | Manager 的全部能力 + 删除容器 |

> 通过 Delegated 调用创建容器的用户会被自动分配 Owner 角色。

### 两种访问模式

- **Delegated（委托/用户代理）**：推荐方式。应用代表登录用户操作，有效权限 = 应用权限 ∩ 用户权限。可审计到具体用户。
- **App-only（纯应用）**：应用使用 Client Credentials 直接操作，拥有 Container Type 级别的全部权限，不受用户角色限制。适合后台任务，但审计粒度较低。

**Read more:**
- [SharePoint Embedded authentication and authorization](https://learn.microsoft.com/en-us/sharepoint/dev/embedded/development/auth)
- [Register container type application permissions](https://learn.microsoft.com/en-us/sharepoint/dev/embedded/getting-started/register-api-documentation)
- [Microsoft Graph auth concepts](https://learn.microsoft.com/en-us/graph/auth/auth-concepts)

---

## 5. 共享与权限管理

### 权限继承与 Additive Permission

Container 内的内容默认继承父级权限（Container → Folder → File），这个继承链 **不可打破**。但可以通过 Additive Permission（附加权限）给特定文件或文件夹 **扩展** 访问范围。

例如：UserA 是 Reader 角色（通常只能读），但可以通过 Additive Permission 获得对某个文档的编辑权限。

> **限制：** 不能对容器根目录添加 Additive Permission（这相当于直接修改角色了），且只能通过 Delegated 模式设置。

### 共享模型

Container Type 可配置两种共享模型：

| 模型 | 谁能给文件添加新权限 |
|---|---|
| **Open（开放，默认）** | 任何拥有编辑权限的成员 |
| **Restrictive（限制）** | 仅 Owner 和 Manager 角色 |

### 外部共享

SPE 应用的共享能力默认继承 Consuming Tenant 的全局共享策略。但 Consuming Tenant 管理员可以通过 `Set-SPOApplication` 为某个 SPE 应用单独配置不同的外部共享策略——即使全局禁止访客共享，也可以让特定应用允许。

**Read more:**
- [Sharing and permissions in SharePoint Embedded](https://learn.microsoft.com/en-us/sharepoint/dev/embedded/development/sharing-and-perm)
- [Consuming Tenant Admin](https://learn.microsoft.com/en-us/sharepoint/dev/embedded/administration/consuming-tenant-admin/cta)

---

## 6. Container Type 与计费

### 三种 Container Type

| 类型 | 计费分类 | 适用场景 | 关键限制 |
|---|---|---|---|
| **Trial** | `trial` | 开发验证与功能评估 | 最多 5 个容器，每个 1 GB，30 天过期，仅限本租户 |
| **Standard** | `standard` | 生产环境（ISV 付费） | 费用由 Owning Tenant 的 Azure 订阅承担 |
| **Passthrough** | `directToCustomer` | 生产环境（客户付费） | 费用由 Consuming Tenant 的 Azure 订阅承担 |

- 每个租户最多可同时拥有 **25 个** Standard Container Type。
- 一个应用只能拥有 **1 个** Container Type（1:1 绑定）。
- Trial 不可转为 Standard，Standard 不可转为 Passthrough，互相不可转换。

### 计费模型

SPE 采用 Pay-as-you-go（按量付费）模式，按以下维度计量：

- 活跃存储量
- 归档存储量
- API 调用次数

> SPE 的存储 **不占用** 客户已有的 M365 SharePoint 存储配额，而是通过 Azure 订阅独立计费。

### 标准计费设置流程

对于 Standard Container Type，Owning Tenant 管理员需要：
1. 准备一个 Azure 订阅 + 资源组
2. 创建 Container Type 后，通过 PowerShell 绑定计费：

```powershell
Add-SPOContainerTypeBilling –ContainerTypeId <ID> -AzureSubscriptionId <SubId> -ResourceGroup <RG> -Region <Region>
```

> 执行此命令的管理员需具有 Azure 订阅的 Owner/Contributor 权限，且被分配了 SharePoint Embedded Administrator 或 Global Administrator 角色。

**Read more:**
- [SharePoint Embedded container types](https://learn.microsoft.com/en-us/sharepoint/dev/embedded/getting-started/containertypes)
- [SharePoint Embedded billing models](https://learn.microsoft.com/en-us/sharepoint/dev/embedded/administration/billing/billing)
- [Limits and calling patterns](https://learn.microsoft.com/en-us/sharepoint/dev/embedded/development/limits-calling)

---

## 7. 实施路径速览

以下是从零到上线的关键步骤：

### 阶段一：开发准备

1. 在 Entra ID 中注册应用，配置所需 Graph 权限
2. 在 Owning Tenant 创建 Container Type（Trial 即可快速验证）
3. 在本地注册 Container Type

> 推荐使用 [SPE VS Code Extension](https://learn.microsoft.com/en-us/sharepoint/dev/embedded/getting-started/spembedded-for-vscode) 快速完成以上步骤。

### 阶段二：应用开发

4. 通过 Microsoft Graph API 实现容器的创建、查询、文件操作
5. 使用 MSAL（Microsoft Authentication Library）处理认证流程
6. 实现 OBO（On-Behalf-Of）流程让后端代表用户调用 Graph API

典型的 API 调用模式如下：

```http
POST https://graph.microsoft.com/v1.0/storage/fileStorage/containers
Content-Type: application/json

{
  "displayName": "My App Container",
  "containerTypeId": "<your-container-type-id>"
}
```
> 上面的请求会在 Consuming Tenant 中创建一个新容器，调用者自动成为 Owner。

### 阶段三：部署上线

7. 将应用清单权限调整为 Consuming Tenant 所需的最小集（移除 `FileStorageContainerType.Manage.All`）
8. 在 Consuming Tenant 上获取管理员 Admin Consent
9. 调用 Container Type Registration API 注册容器类型
10. 如为 Passthrough 计费，引导客户管理员在 M365 Admin Center 设置计费

**Read more:**
- [SharePoint Embedded authentication and authorization](https://learn.microsoft.com/en-us/sharepoint/dev/embedded/development/auth)
- [Install your SPE application for customers](https://learn.microsoft.com/en-us/sharepoint/dev/embedded/development/tutorials/vendor-install-app-customer)
- [Developer Admin](https://learn.microsoft.com/en-us/sharepoint/dev/embedded/administration/developer-admin/dev-admin)

---

## 8. 与普通 SharePoint 的关键区别

| 维度 | 普通 SharePoint | SharePoint Embedded |
|---|---|---|
| **访问方式** | 站点 UI + API 双通道 | 纯 API（Microsoft Graph），无站点 UI |
| **存储单元** | Site → Document Library | Application → Container Type → Container |
| **存储配额** | 计入 M365 SharePoint 配额 | 独立按量计费，不占 M365 配额 |
| **权限管理** | 站点级、库级、项目级权限 | Container 级角色 + Additive Permission |
| **合规能力** | 全部 M365 Purview 能力 | 同样享有 eDiscovery、DLP、审计、保留策略、敏感度标签等 |
| **协作** | Office Online + Desktop 完整体验 | 同样支持 Office Web/Desktop 的查看、编辑、共同编辑 |
| **管理员** | SharePoint Admin | SharePoint Embedded Administrator（新角色） |
| **用户许可证** | 访问者通常需要 M365 许可证 | 访问者通常 **不需要** M365 许可证（少数操作例外） |

> **核心差异总结：** SPE 把 SharePoint 的"存储 + 协作 + 合规"能力解耦出来，以纯 API 的姿态嵌入到你自己的应用中，同时保证数据始终驻留在客户租户内。

**Read more:**
- [Overview of SharePoint Embedded](https://learn.microsoft.com/en-us/sharepoint/dev/embedded/overview)
- [SharePoint Embedded for VS Code](https://learn.microsoft.com/en-us/sharepoint/dev/embedded/getting-started/spembedded-for-vscode)

---

## 9. 常见误区

| 误区 | 事实 |
|---|---|
| "SPE 的文件存在开发者的租户里" | 文件 **始终** 存储在 Consuming Tenant（客户租户），开发者的应用只有 API 访问权，不持有数据 |
| "用了 SPE 就不需要 Admin Consent" | Consuming Tenant 的管理员必须对应用授予 Admin Consent 后才能使用 |
| "一个应用可以创建多个 Container Type" | 应用与 Container Type 是严格 1:1 关系 |
| "Trial Container Type 可以升级为 Standard" | 不可以。Trial 过期后必须删除，重新创建 Standard Container Type |
| "纯应用模式（App-only）的权限和代理模式（Delegated）一样" | App-only 获得 Container Type 级别的全部权限，不受用户角色限制；Delegated 的有效权限是应用权限和用户角色的 **交集** |
| "SPE 存储算在 M365 的 SharePoint 配额里" | SPE 有独立的 Azure 按量计费，不计入 M365 SharePoint 存储配额 |
| "用户需要 Office 许可证才能在 SPE 中协作" | 大多数操作 **不需要** Office 许可证。但 @mentions 人员选择器、List containers（代理模式）等少数功能目前仍依赖许可证 |

**Read more:**
- [Authentication and authorization](https://learn.microsoft.com/en-us/sharepoint/dev/embedded/development/auth)
- [Container types](https://learn.microsoft.com/en-us/sharepoint/dev/embedded/getting-started/containertypes)

---

## 10. 术语速查表

以下是本文档涉及的核心术语，首次出现时附中文释义：

| 术语 | 中文释义 | 简要说明 |
|---|---|---|
| SharePoint Embedded (SPE) | SharePoint 嵌入式 | 微软纯 API 文件管理平台 |
| Container | 容器 | SPE 最小存储与安全边界单元 |
| Container Type | 容器类型 | 定义应用与容器集合之间关系的资源 |
| Owning Tenant | 拥有租户/开发租户 | 创建 Container Type 的租户 |
| Consuming Tenant | 消费租户/客户租户 | 使用应用、存储文件的租户 |
| Owning Application | 拥有应用 | 创建和管理 Container Type 的 Entra ID 应用 |
| Guest Application | 来宾应用 | 被授权访问他人容器类型的应用 |
| Microsoft Graph | 微软统一 API 网关 | SPE 所有操作的 API 入口 |
| Microsoft Entra ID | 微软身份平台（原 Azure AD） | 应用注册与身份认证平台 |
| Delegated (access) | 委托访问/用户代理 | 应用代表登录用户操作 |
| App-only (access) | 纯应用访问 | 应用用自身身份直接操作 |
| OBO (On-Behalf-Of) | 代理流程 | 后端用前端令牌换取 Graph 令牌的认证模式 |
| Additive Permission | 附加权限 | 在继承权限之上为特定文件/文件夹扩展的额外权限 |
| Admin Consent | 管理员同意 | 租户管理员批准应用所请求的权限 |
| PAYG (Pay-as-you-go) | 按量付费 | SPE 的计费模式 |

---

## 11. 扩展阅读地图

按主题分组的官方文档导航，方便你按需深入：

### 入门与总览

- [Overview of SharePoint Embedded](https://learn.microsoft.com/en-us/sharepoint/dev/embedded/overview)
- [SharePoint Embedded app architecture](https://learn.microsoft.com/en-us/sharepoint/dev/embedded/development/app-architecture)
- [SharePoint Embedded for VS Code（快速试玩）](https://learn.microsoft.com/en-us/sharepoint/dev/embedded/getting-started/spembedded-for-vscode)

### 认证与权限

- [Authentication and authorization](https://learn.microsoft.com/en-us/sharepoint/dev/embedded/development/auth)
- [Sharing and permissions](https://learn.microsoft.com/en-us/sharepoint/dev/embedded/development/sharing-and-perm)
- [Register container type application permissions](https://learn.microsoft.com/en-us/sharepoint/dev/embedded/getting-started/register-api-documentation)

### Container Type 与计费

- [Container types](https://learn.microsoft.com/en-us/sharepoint/dev/embedded/getting-started/containertypes)
- [Billing models](https://learn.microsoft.com/en-us/sharepoint/dev/embedded/administration/billing/billing)
- [Limits and calling patterns](https://learn.microsoft.com/en-us/sharepoint/dev/embedded/development/limits-calling)

### 管理与运维

- [Developer Admin](https://learn.microsoft.com/en-us/sharepoint/dev/embedded/administration/developer-admin/dev-admin)
- [Consuming Tenant Admin](https://learn.microsoft.com/en-us/sharepoint/dev/embedded/administration/consuming-tenant-admin/cta)
- [Container management in PowerShell](https://learn.microsoft.com/en-us/sharepoint/dev/embedded/administration/consuming-tenant-admin/ctapowershell)
- [Container management in SharePoint Admin Center](https://learn.microsoft.com/en-us/sharepoint/dev/embedded/administration/consuming-tenant-admin/ctaUX)

### 开发教程

- [Install your SPE application for customers](https://learn.microsoft.com/en-us/sharepoint/dev/embedded/development/tutorials/vendor-install-app-customer)
- [Microsoft Learning: SPE overview & configuration](https://learn.microsoft.com/en-us/training/modules/sharepoint-embedded-setup)
- [Microsoft Learning: SPE building applications](https://learn.microsoft.com/en-us/training/modules/sharepoint-embedded-create-app)

### 仓库源码

- [SharePoint/sp-dev-docs · docs/embedded](https://github.com/SharePoint/sp-dev-docs/tree/main/docs/embedded) — 所有 SPE 文档的开源仓库入口

---

> **文档版本：** 2026-03-24 · 基于 [SharePoint/sp-dev-docs](https://github.com/SharePoint/sp-dev-docs) 与 Microsoft Learn 官方文档编写
