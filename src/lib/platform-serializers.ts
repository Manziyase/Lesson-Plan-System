/*
 * Safe JSON shapes shared by platform API routes. Never include password
 * hashes, TOTP secrets or recovery tokens.
 */

import { safeJson } from "./platform-utils";

export type PlanRecord = {
  id: string;
  code: string;
  name: string;
  description: string;
  monthlyPrice: number;
  annualPrice: number;
  currency: string;
  maxTeachers: number | null;
  maxUsers: number | null;
  maxClasses: number | null;
  maxStorageMb: number | null;
  features: string;
  isActive: boolean;
  isDefault: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  _count?: { subscriptions: number };
};

export function planJson(plan: PlanRecord) {
  return {
    id: plan.id,
    code: plan.code,
    name: plan.name,
    description: plan.description,
    monthlyPrice: plan.monthlyPrice,
    annualPrice: plan.annualPrice,
    currency: plan.currency,
    maxTeachers: plan.maxTeachers,
    maxUsers: plan.maxUsers,
    maxClasses: plan.maxClasses,
    maxStorageMb: plan.maxStorageMb,
    features: safeJson<string[]>(plan.features, []),
    isActive: plan.isActive,
    isDefault: plan.isDefault,
    sortOrder: plan.sortOrder,
    subscriptions: plan._count?.subscriptions ?? 0,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
  };
}
