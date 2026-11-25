import type { Router } from "express";
import type { Config } from "../config.js";
import type { FileStore } from "../storage.js";
import type { ResolveActor } from "../../shared/b-contracts.js";
import {
  isApprovedVersion,
  type ReviewSubmission,
} from "../../shared/publication.js";
import { createDefaultReviewer } from "../moderation/review.js";
import { createTestResolveActor } from "../lost-matching/deps.js";
import { foundPublicationRouter } from "../publication/found-routes.js";
import { mediaRouter } from "../publication/media.js";
import { ensureStagingDir } from "../publication/staging.js";

export interface ModerationPublicationHandles {
  reviewSubmission: ReviewSubmission;
  isApprovedVersion: typeof isApprovedVersion;
  mountRoutes: (app: Router) => void;
}

export async function createModerationPublication(options: {
  config: Config;
  store: FileStore;
  resolveActor?: ResolveActor;
  reviewSubmission?: ReviewSubmission;
}): Promise<ModerationPublicationHandles> {
  await ensureStagingDir(options.config.dataDir);
  const resolveActor =
    options.resolveActor ||
    createTestResolveActor(!options.config.production);
  const reviewSubmission =
    options.reviewSubmission || createDefaultReviewer(options.config);

  const mountRoutes = (app: Router) => {
    app.use(
      "/api",
      foundPublicationRouter({
        dataDir: options.config.dataDir,
        store: options.store,
        resolveActor,
        reviewSubmission,
      }),
    );
    app.use(
      "/api",
      mediaRouter({
        dataDir: options.config.dataDir,
        store: options.store,
        resolveActor,
      }),
    );
  };

  return {
    reviewSubmission,
    isApprovedVersion,
    mountRoutes,
  };
}
