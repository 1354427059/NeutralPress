// scripts/seed-defaults.ts
// 数据库默认值种子脚本

import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

import RLog from "rlog-js";

import { loadPrismaClientConstructor } from "@/../scripts/load-prisma-client";

const rlog = new RLog();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pool: any;

// 从数据文件导入默认配置
import { defaultConfigs } from "../src/data/default-configs";
import { defaultMenus } from "../src/data/default-menus";
import { defaultPages } from "../src/data/default-pages";

const BRANDING_CONFIG_PATCHES = [
  {
    key: "site.title",
    oldDefault: "NeutralPress",
    newDefault: "kilig",
  },
  {
    key: "site.slogan.primary",
    oldDefault: "A neutral place to thoughts.",
    newDefault: "A kilig place for thoughts.",
  },
  {
    key: "site.slogan.secondary",
    oldDefault: "Welcome to NeutralPress",
    newDefault: "Welcome to kilig",
  },
  {
    key: "site.copyright",
    oldDefault: [
      "All rights reserved.",
      "Powered by <a href='https://github.com/RavelloH/NeutralPress'>NeutralPress</a>.",
    ],
    newDefault: [
      "All rights reserved.",
      "Powered by <a href='https://github.com/1354427059/NeutralPress'>kilig</a>.",
    ],
  },
  {
    key: "seo.keywords",
    oldDefault: ["CMS", "Blog", "NeutralPress"],
    newDefault: ["CMS", "Blog", "kilig"],
  },
  {
    key: "notice.email.from.name",
    oldDefault: "NeutralPress",
    newDefault: "kilig",
  },
] as const;

const BRANDING_MENU_PATCHES = [
  {
    id: "menu-github",
    action: "update",
    oldMenu: {
      name: "GitHub",
      icon: "github-fill",
      link: "https://github.com/RavelloH/NeutralPress",
      slug: null,
      status: "ACTIVE",
      order: 1,
      category: "OUTSITE",
      pageId: null,
    },
    data: {
      link: "https://github.com/1354427059/NeutralPress",
    },
  },
  {
    id: "menu-documentation",
    action: "delete",
    oldMenu: {
      name: "使用文档",
      icon: "book-2-fill",
      link: "https://neutralpress.net",
      slug: null,
      status: "ACTIVE",
      order: 2,
      category: "OUTSITE",
      pageId: null,
    },
  },
  {
    id: "menu-demo",
    action: "delete",
    oldMenu: {
      name: "Demo",
      icon: "computer-fill",
      link: "https://ravelloh.com",
      slug: null,
      status: "ACTIVE",
      order: 3,
      category: "OUTSITE",
      pageId: null,
    },
  },
  {
    id: "menu-rerport",
    action: "delete",
    oldMenu: {
      name: "报告问题",
      icon: "bug-2-fill",
      link: "https://github.com/RavelloH/NeutralPress/issues",
      slug: null,
      status: "ACTIVE",
      order: 4,
      category: "OUTSITE",
      pageId: null,
    },
  },
] as const;

const BRANDING_PAGE_PATCHES = {
  "system-home": {
    metaDescription: {
      old:
        "NeutralPress 是专为博客和内容创作者设计的现代化CMS系统，提供完整的内容管理、发布和分析功能",
      next: "kilig 是专为博客和内容创作者设计的现代化CMS系统，提供完整的内容管理、发布和分析功能",
    },
    blockTextUpdates: [
      {
        blockId: 1,
        path: ["content", "title", "value"],
        old: "NeutralPress | 中性色",
        next: "kilig | 中性色",
      },
    ],
  },
  "system-about-page": {
    metaDescription: {
      old: "了解 NeutralPress 团队的故事、使命和愿景，以及我们如何为内容创作者提供更好的工具",
      next: "了解 kilig 团队的故事、使命和愿景，以及我们如何为内容创作者提供更好的工具",
    },
    blockTextUpdates: [
      {
        blockId: 14,
        path: ["content", "title"],
        old: "开始用 NeutralPress 吧",
        next: "开始用 kilig 吧",
      },
    ],
  },
} as const;

const DEFAULT_LOCAL_STORAGE_NAME = "local-app-server";
const DEFAULT_LOCAL_STORAGE_DISPLAY_NAME = "应用服务器本地存储";
const DEFAULT_LOCAL_STORAGE_ROOT = "/var/www/uploads";
const DEFAULT_LOCAL_STORAGE_BASE_URL = "/";
const DEFAULT_LOCAL_STORAGE_MAX_FILE_SIZE = 52_428_800;
const DEFAULT_LOCAL_STORAGE_PATH_TEMPLATE = "/{year}/{month}/{filename}";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function seedDefaults(options?: { prisma?: any }) {
  const externalPrisma = options?.prisma;
  const shouldManagePrismaLifecycle = !externalPrisma;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let prisma: any = externalPrisma;
    if (!prisma) {
      try {
        const PrismaClient = await loadPrismaClientConstructor();
        const { Pool } = await import("pg");
        const { PrismaPg } = await import("@prisma/adapter-pg");

        // 使用与生产环境相同的 adapter 模式
        pool = new Pool({
          connectionString: process.env.DATABASE_URL,
        });
        const adapter = new PrismaPg(pool);

        prisma = new PrismaClient({
          adapter,
          log: [],
        });

        // 测试连接
        await prisma.$connect();
      } catch (error) {
        rlog.warning(
          "Prisma client not initialized, skipping default value seeding",
        );
        rlog.warning("Error details:", error);
        return;
      }
    }

    // 种子化默认配置
    await seedDefaultConfigs(prisma);
    await patchOfficialBrandingConfigs(prisma);

    // 种子化系统文件夹
    await seedSystemFolders(prisma);

    // 为自部署场景补齐一个可用的默认本地存储
    await seedDefaultLocalStorage(prisma);

    // 生成 VAPID 密钥（如果需要）
    await generateVapidKeysIfNeeded(prisma);

    // 种子化默认页面和菜单
    await seedDefaultPagesAndMenus(prisma);
    await patchOfficialBrandingMenus(prisma);
    await patchOfficialBrandingPages(prisma);

    rlog.success("✓ Database default values check completed");
    if (shouldManagePrismaLifecycle) {
      await prisma.$disconnect();

      // 关闭连接池
      if (pool) {
        try {
          await pool.end();
          rlog.info("  Connection pool closed");
        } catch (error) {
          rlog.warning(
            `  Error closing connection pool: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }
  } catch (error) {
    rlog.error("Database default value seeding failed:", error);
    throw error;
  }
}

// 为应用服务器/Docker 自部署场景补一个默认本地存储
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function seedDefaultLocalStorage(prisma: any) {
  rlog.log("> Checking default local storage...");

  const providers = await prisma.storageProvider.findMany({
    where: {
      name: {
        not: "external-url",
      },
    },
    select: {
      id: true,
      name: true,
      type: true,
      isActive: true,
      isDefault: true,
    },
  });

  const hasActiveDefaultStorage = providers.some(
    (provider: { isActive: boolean; isDefault: boolean }) =>
      provider.isActive && provider.isDefault,
  );
  if (hasActiveDefaultStorage) {
    rlog.info("  | Active default storage already exists");
    return;
  }

  const hasAnyActiveStorage = providers.some(
    (provider: { isActive: boolean }) => provider.isActive,
  );
  if (hasAnyActiveStorage) {
    rlog.info(
      "  | Active storage providers already exist, skipping local storage bootstrap",
    );
    return;
  }

  const storageRoot = path.resolve(DEFAULT_LOCAL_STORAGE_ROOT);
  try {
    await fs.mkdir(storageRoot, { recursive: true });
    await fs.access(storageRoot, fsConstants.W_OK);
  } catch (error) {
    rlog.warning(
      `  Local storage root is not writable, skipping bootstrap: ${storageRoot}`,
    );
    rlog.warning("  Error details:", error);
    return;
  }

  const existingBootstrapStorage = providers.find(
    (provider: { name: string }) => provider.name === DEFAULT_LOCAL_STORAGE_NAME,
  );

  if (existingBootstrapStorage) {
    await prisma.storageProvider.update({
      where: { id: existingBootstrapStorage.id },
      data: {
        type: "LOCAL",
        displayName: DEFAULT_LOCAL_STORAGE_DISPLAY_NAME,
        baseUrl: DEFAULT_LOCAL_STORAGE_BASE_URL,
        isActive: true,
        isDefault: true,
        maxFileSize: DEFAULT_LOCAL_STORAGE_MAX_FILE_SIZE,
        pathTemplate: DEFAULT_LOCAL_STORAGE_PATH_TEMPLATE,
        config: {
          rootDir: storageRoot,
          createDirIfNotExists: "true",
          fileMode: "0644",
          dirMode: "0755",
        },
      },
    });
    rlog.info(
      `  | Repaired bootstrap storage: ${DEFAULT_LOCAL_STORAGE_NAME} -> ${storageRoot}`,
    );
    return;
  }

  await prisma.storageProvider.updateMany({
    where: { isDefault: true },
    data: { isDefault: false },
  });

  await prisma.storageProvider.create({
    data: {
      name: DEFAULT_LOCAL_STORAGE_NAME,
      type: "LOCAL",
      displayName: DEFAULT_LOCAL_STORAGE_DISPLAY_NAME,
      baseUrl: DEFAULT_LOCAL_STORAGE_BASE_URL,
      isActive: true,
      isDefault: true,
      maxFileSize: DEFAULT_LOCAL_STORAGE_MAX_FILE_SIZE,
      pathTemplate: DEFAULT_LOCAL_STORAGE_PATH_TEMPLATE,
      config: {
        rootDir: storageRoot,
        createDirIfNotExists: "true",
        fileMode: "0644",
        dirMode: "0755",
      },
    },
  });
  rlog.info(
    `  | Added bootstrap local storage: ${DEFAULT_LOCAL_STORAGE_NAME} -> ${storageRoot}`,
  );
}

// 生成 VAPID 密钥（如果需要）
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function generateVapidKeysIfNeeded(prisma: any) {
  rlog.log("> Checking VAPID keys for Web Push...");

  try {
    // 检查配置是否存在
    const vapidConfig = await prisma.config.findUnique({
      where: { key: "notice.webPush.vapidKeys" },
    });

    if (!vapidConfig) {
      rlog.warning("  VAPID config not found, skipping");
      return;
    }

    // 检查是否需要生成密钥
    const configValue = vapidConfig.value as {
      default?: { publicKey?: string; privateKey?: string };
    };

    if (
      !configValue?.default ||
      configValue.default.publicKey === "[AUTO_GENERATED]" ||
      !configValue.default.publicKey ||
      !configValue.default.privateKey
    ) {
      rlog.log("  Generating new VAPID keys...");

      try {
        // 动态导入 web-push（可能尚未安装）
        const webpush = await import("web-push");
        const vapidKeys = webpush.default.generateVAPIDKeys();

        // 更新配置
        await prisma.config.update({
          where: { key: "notice.webPush.vapidKeys" },
          data: {
            value: {
              default: {
                publicKey: vapidKeys.publicKey,
                privateKey: vapidKeys.privateKey,
              },
            },
          },
        });

        rlog.success(
          `✓ Generated VAPID keys for Web Push (Public Key: ${vapidKeys.publicKey.substring(0, 20)}...)`,
        );
      } catch {
        rlog.warning(
          "  web-push package not installed, skipping VAPID key generation",
        );
        rlog.warning(
          "  Please run 'pnpm add web-push' and re-run the build script",
        );
      }
    } else {
      rlog.info("  VAPID keys already configured, skipping");
    }
  } catch (error) {
    rlog.error("  Failed to generate VAPID keys:", error);
  }
}

// 种子化默认配置
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function seedDefaultConfigs(prisma: any) {
  rlog.log("> Checking default configurations...");

  let addedCount = 0;
  let skippedCount = 0;

  // 一次性获取所有现有配置，避免 N+1 查询问题
  const existingConfigs = await prisma.config.findMany({
    select: { key: true },
  });

  // 创建现有配置 key 的 Set，便于快速查找
  const existingKeys = new Set(
    existingConfigs.map((config: { key: string }) => config.key),
  );

  // 准备要添加的配置数据
  const configsToAdd = [];

  for (const config of defaultConfigs) {
    if (!existingKeys.has(config.key)) {
      configsToAdd.push({
        key: config.key,
        value: config.value,
      });
      addedCount++;
    } else {
      skippedCount++;
    }
  }

  // 批量创建新配置
  if (configsToAdd.length > 0) {
    try {
      await prisma.config.createMany({
        data: configsToAdd,
      });

      // 记录添加的配置
      for (const config of configsToAdd) {
        rlog.info(`  | Added config: ${config.key}`);
      }
    } catch (error) {
      rlog.error(`  | Batch config creation failed:`, error);

      // 如果批量添加失败，尝试逐个添加（降级处理）
      for (const config of configsToAdd) {
        try {
          await prisma.config.create({
            data: config,
          });
          rlog.info(`  | Added config: ${config.key}`);
        } catch (individualError) {
          rlog.error(
            `  | Failed to add config ${config.key}:`,
            individualError,
          );
          addedCount--;
        }
      }
    }
  }

  rlog.success(
    `✓ Configuration check completed: added ${addedCount} items, skipped ${skippedCount} items`,
  );
}

function cloneJsonValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getNestedValue(
  source: Record<string, unknown>,
  path: readonly string[],
): unknown {
  let current: unknown = source;
  for (const key of path) {
    if (!isJsonObject(current) || !(key in current)) {
      return undefined;
    }
    current = current[key];
  }
  return current;
}

function setNestedValue(
  source: Record<string, unknown>,
  path: readonly string[],
  value: unknown,
): boolean {
  let current: Record<string, unknown> = source;
  for (let index = 0; index < path.length - 1; index += 1) {
    const key = path[index];
    const next = current[key];
    if (!isJsonObject(next)) {
      return false;
    }
    current = next;
  }

  const lastKey = path[path.length - 1];
  if (!lastKey || !(lastKey in current)) {
    return false;
  }

  current[lastKey] = value;
  return true;
}

function matchesBrandingMenuPatch(
  menu: {
    name: string;
    icon: string | null;
    link: string | null;
    slug: string | null;
    status: string;
    order: number;
    category: string;
    pageId: string | null;
  },
  expected: (typeof BRANDING_MENU_PATCHES)[number]["oldMenu"],
) {
  return (
    menu.name === expected.name &&
    menu.icon === expected.icon &&
    menu.link === expected.link &&
    menu.slug === expected.slug &&
    menu.status === expected.status &&
    menu.order === expected.order &&
    menu.category === expected.category &&
    menu.pageId === expected.pageId
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function patchOfficialBrandingConfigs(prisma: any) {
  rlog.log("> Checking official branding config patches...");

  let patchedCount = 0;

  const existingConfigs = await prisma.config.findMany({
    where: {
      key: {
        in: BRANDING_CONFIG_PATCHES.map((patch) => patch.key),
      },
    },
    select: {
      key: true,
      value: true,
    },
  });

  for (const config of existingConfigs) {
    const patch = BRANDING_CONFIG_PATCHES.find((item) => item.key === config.key);
    if (!patch) continue;
    if (!isJsonObject(config.value) || !("default" in config.value)) continue;

    if (JSON.stringify(config.value.default) !== JSON.stringify(patch.oldDefault)) {
      continue;
    }

    await prisma.config.update({
      where: { key: config.key },
      data: {
        value: {
          ...cloneJsonValue(config.value),
          default: cloneJsonValue(patch.newDefault),
        },
      },
    });

    patchedCount += 1;
    rlog.info(`  | Patched branding config: ${config.key}`);
  }

  rlog.success(`✓ Branding config patch completed: updated ${patchedCount} items`);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function patchOfficialBrandingMenus(prisma: any) {
  rlog.log("> Checking official branding menu patches...");

  let updatedCount = 0;
  let deletedCount = 0;

  const existingMenus = await prisma.menu.findMany({
    where: {
      id: {
        in: BRANDING_MENU_PATCHES.map((patch) => patch.id),
      },
    },
    select: {
      id: true,
      name: true,
      icon: true,
      link: true,
      slug: true,
      status: true,
      order: true,
      category: true,
      pageId: true,
    },
  });

  for (const menu of existingMenus) {
    const patch = BRANDING_MENU_PATCHES.find((item) => item.id === menu.id);
    if (!patch) continue;
    if (!matchesBrandingMenuPatch(menu, patch.oldMenu)) continue;

    if (patch.action === "update") {
      await prisma.menu.update({
        where: { id: menu.id },
        data: patch.data,
      });
      updatedCount += 1;
      rlog.info(`  | Patched branding menu: ${menu.id}`);
      continue;
    }

    await prisma.menu.delete({
      where: { id: menu.id },
    });
    deletedCount += 1;
    rlog.info(`  | Removed branding menu: ${menu.id}`);
  }

  rlog.success(
    `✓ Branding menu patch completed: updated ${updatedCount} items, removed ${deletedCount} items`,
  );
}

// 种子化默认页面和菜单
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function seedDefaultPagesAndMenus(prisma: any) {
  rlog.log("> Checking default pages and menus...");

  let pagesAddedCount = 0;
  let pagesSkippedCount = 0;
  let menusAddedCount = 0;
  let menusSkippedCount = 0;

  // 检查现有的页面
  const existingPages = await prisma.page.findMany({
    select: { id: true, slug: true },
  });
  const existingPageIds = new Set(
    existingPages.map((page: { id: string }) => page.id),
  );
  const existingPageSlugs = new Set(
    existingPages.map((page: { slug: string }) => page.slug),
  );

  // 先创建页面
  const pagesToAdd = [];
  for (const page of defaultPages) {
    if (!existingPageIds.has(page.id) && !existingPageSlugs.has(page.slug)) {
      pagesToAdd.push({
        id: page.id,
        title: page.title,
        slug: page.slug,
        content: page.content || "",
        contentType: page.contentType || "MARKDOWN",
        config: page.config || null,
        status: page.status,
        metaDescription: page.metaDescription,
        metaKeywords: page.metaKeywords,
        isSystemPage: page.isSystemPage || false,
        robotsIndex: page.robotsIndex ?? true,
      });
      pagesAddedCount++;
    } else {
      pagesSkippedCount++;
    }
  }

  if (pagesToAdd.length > 0) {
    try {
      await prisma.page.createMany({
        data: pagesToAdd,
      });

      for (const page of pagesToAdd) {
        rlog.log(`  | Added page: ${page.title} (${page.slug})`);
      }
    } catch (error) {
      rlog.error(`  | Batch page creation failed:`, error);

      // 降级处理：逐个创建
      for (const pageData of pagesToAdd) {
        try {
          await prisma.page.create({
            data: pageData,
          });
          rlog.log(`  | Added page: ${pageData.title} (${pageData.slug})`);
        } catch (individualError) {
          rlog.error(
            `  | Failed to add page ${pageData.title}:`,
            individualError,
          );
          pagesAddedCount--;
        }
      }
    }
  }

  // 检查现有的菜单
  const existingMenus = await prisma.menu.findMany({
    select: { id: true, slug: true },
  });
  const existingMenuIds = new Set(
    existingMenus.map((menu: { id: string }) => menu.id),
  );
  const existingMenuSlugs = new Set(
    existingMenus.map((menu: { slug?: string }) => menu.slug),
  );

  // 创建菜单
  const menusToAdd = [];
  for (const menu of defaultMenus) {
    if (!existingMenuIds.has(menu.id) && !existingMenuSlugs.has(menu.slug)) {
      menusToAdd.push({
        id: menu.id,
        name: menu.name,
        icon: menu.icon,
        link: menu.link,
        slug: menu.slug,
        status: menu.status,
        order: menu.order,
        category: menu.category,
        pageId: menu.pageId,
      });
      menusAddedCount++;
    } else {
      menusSkippedCount++;
    }
  }

  if (menusToAdd.length > 0) {
    try {
      await prisma.menu.createMany({
        data: menusToAdd,
      });

      for (const menu of menusToAdd) {
        rlog.info(
          `  | Added menu: ${menu.name} (${menu.slug || menu.link || menu.pageId})`,
        );
      }
    } catch (error) {
      rlog.error(`  | Batch menu creation failed:`, error);

      // 降级处理：逐个创建
      for (const menuData of menusToAdd) {
        try {
          await prisma.menu.create({
            data: menuData,
          });
          rlog.info(`  | Added menu: ${menuData.name} (${menuData.slug})`);
        } catch (individualError) {
          rlog.error(
            `  | Failed to add menu ${menuData.name}:`,
            individualError,
          );
          menusAddedCount--;
        }
      }
    }
  }

  rlog.success(
    `✓ Pages and menus check completed: added ${pagesAddedCount} pages, ${menusAddedCount} menus, skipped ${pagesSkippedCount} pages, ${menusSkippedCount} menus`,
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function patchOfficialBrandingPages(prisma: any) {
  rlog.log("> Checking official branding page patches...");

  let patchedCount = 0;
  const pageIds = Object.keys(BRANDING_PAGE_PATCHES);
  const pages = await prisma.page.findMany({
    where: {
      id: {
        in: pageIds,
      },
    },
    select: {
      id: true,
      config: true,
      metaDescription: true,
    },
  });

  for (const page of pages) {
    const patch = BRANDING_PAGE_PATCHES[page.id as keyof typeof BRANDING_PAGE_PATCHES];
    if (!patch) continue;

    let changed = false;
    const data: Record<string, unknown> = {};
    const nextConfig = cloneJsonValue(page.config);

    if (page.metaDescription === patch.metaDescription.old) {
      data.metaDescription = patch.metaDescription.next;
      changed = true;
    }

    if (isJsonObject(nextConfig) && Array.isArray(nextConfig.blocks)) {
      for (const blockPatch of patch.blockTextUpdates) {
        const targetBlock = nextConfig.blocks.find(
          (block): block is Record<string, unknown> =>
            isJsonObject(block) && block.id === blockPatch.blockId,
        );

        if (!targetBlock) continue;

        const currentValue = getNestedValue(targetBlock, blockPatch.path);
        if (currentValue !== blockPatch.old) continue;

        if (setNestedValue(targetBlock, blockPatch.path, blockPatch.next)) {
          changed = true;
        }
      }
    }

    if (!changed) continue;

    if (nextConfig !== undefined) {
      data.config = nextConfig;
    }

    await prisma.page.update({
      where: { id: page.id },
      data,
    });

    patchedCount += 1;
    rlog.info(`  | Patched branding page: ${page.id}`);
  }

  rlog.success(`✓ Branding page patch completed: updated ${patchedCount} pages`);
}

// 种子化系统文件夹
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function seedSystemFolders(prisma: any) {
  rlog.log("> Checking system folders...");

  let addedCount = 0;
  let skippedCount = 0;

  // 获取现有系统文件夹
  const existingFolders = await prisma.virtualFolder.findMany({
    where: {
      systemType: {
        in: ["ROOT_PUBLIC", "ROOT_USERS"],
      },
    },
    select: { id: true, systemType: true },
  });

  const existingSystemTypes = new Set(
    existingFolders.map((f: { systemType: string }) => f.systemType),
  );

  // 创建 Public 根文件夹
  if (!existingSystemTypes.has("ROOT_PUBLIC")) {
    try {
      await prisma.virtualFolder.create({
        data: {
          id: 1,
          name: "Public",
          systemType: "ROOT_PUBLIC",
          parentId: null,
          userUid: null,
          path: "1", // 根节点的 path 为自己的 ID（格式：包含自己的ID，如 Comment）
          depth: 0,
          order: 0,
        },
      });
      rlog.info("  | Added system folder: Public (ROOT_PUBLIC)");
      addedCount++;
    } catch (error) {
      rlog.error("  | Failed to add Public folder:", error);
    }
  } else {
    skippedCount++;
    rlog.info("  | System folder already exists: Public (ROOT_PUBLIC)");
  }

  // 创建 Users 根文件夹
  if (!existingSystemTypes.has("ROOT_USERS")) {
    try {
      await prisma.virtualFolder.create({
        data: {
          id: 2,
          name: "Users",
          systemType: "ROOT_USERS",
          parentId: null,
          userUid: null,
          path: "2", // 根节点的 path 为自己的 ID（格式：包含自己的ID，如 Comment）
          depth: 0,
          order: 1,
        },
      });
      rlog.info("  | Added system folder: Users (ROOT_USERS)");
      addedCount++;
    } catch (error) {
      rlog.error("  | Failed to add Users folder:", error);
    }
  } else {
    skippedCount++;
    rlog.info("  | System folder already exists: Users (ROOT_USERS)");
  }

  rlog.success(
    `✓ System folders check completed: added ${addedCount} items, skipped ${skippedCount} items`,
  );
}

// 主函数 - 用于直接运行脚本
async function main() {
  try {
    await seedDefaults();
    rlog.success("✓ Database default value seeding completed");
  } catch (error) {
    rlog.error("  Database default value seeding failed:", error);
    process.exit(1);
  }
}

// 只有在直接运行此脚本时才执行
if (
  process.argv[1] &&
  (process.argv[1].endsWith("seed-defaults.ts") ||
    process.argv[1].endsWith("seed-defaults.js"))
) {
  rlog.log("Starting database default value seeding...");
  main();
}
