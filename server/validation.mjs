import { invalid } from "./errors.mjs";
export const defaults = () => ({
  version: 1, profile: {name:"光之冒险者",server:"艾欧泽亚",demo:false},
  owned:[],wishlist:[],plan:[],
  preferences:{category:"all",style:"casual",budget:"45",excludePaid:true,prioritizeWish:true},
  activity:[],lastUpdated:0,
});
const object = (v) => v && typeof v === "object" && !Array.isArray(v);
export function validateArchive(raw, keys, categories) {
  if (!object(raw) || raw.version !== 1 || !object(raw.profile)) invalid("档案格式不正确。");
  const list = (name) => {
    const values=raw[name];
    if (!Array.isArray(values) || values.length > keys.size * 3 + 100) invalid(`${name} 必须是有效的条目列表。`);
    if (values.some((key) => typeof key !== "string" || !keys.has(key))) invalid(`${name} 包含不存在的图鉴条目。`);
    return [...new Set(values)];
  };
  const owned=list("owned"), wish=list("wishlist"), plan=list("plan");
  const text=(value,fallback,max) => {
    if (value !== undefined && typeof value !== "string") invalid("档案文字字段必须是字符串。");
    const s=(value ?? fallback).trim(); if(s.length > max) invalid(`档案文字不能超过 ${max} 个字符。`); return s || fallback;
  };
  const p=raw.preferences ?? defaults().preferences;
  if (!object(p)) invalid("收藏偏好格式不正确。");
  const category=p.category === "weapons" ? "relics" : (p.category ?? "all");
  if (category !== "all" && !categories.has(category)) invalid("收藏分类不存在。");
  if (p.style !== undefined && !["casual","solo","challenge"].includes(p.style)) invalid("收藏方式不存在。");
  if (p.budget !== undefined && !["20","45","90"].includes(p.budget)) invalid("目标数量设置无效。");
  for(const k of ["excludePaid","prioritizeWish"]) if(p[k] !== undefined && typeof p[k] !== "boolean") invalid("收藏偏好开关必须是布尔值。");
  if (raw.profile.demo !== undefined && typeof raw.profile.demo !== "boolean") invalid("演示标记必须是布尔值。");
  if (raw.activity !== undefined && !Array.isArray(raw.activity)) invalid("收藏动态格式不正确。");
  const activity=(raw.activity ?? []).slice(0,30).map((entry) => {
    if(!object(entry) || typeof entry.text !== "string" || !Number.isFinite(entry.at) || entry.at < 0) invalid("收藏动态格式不正确。");
    return {text:entry.text.slice(0,160),at:Math.floor(entry.at)};
  });
  return {
    version:1,
    profile:{name:text(raw.profile.name,"光之冒险者",18),server:text(raw.profile.server,"艾欧泽亚",24),demo:!!raw.profile.demo},
    owned,wishlist:wish.filter((key) => !owned.includes(key)),plan,
    preferences:{category,style:p.style ?? "casual",budget:p.budget ?? "45",excludePaid:p.excludePaid !== false,prioritizeWish:p.prioritizeWish !== false},
    activity,lastUpdated:Number.isFinite(raw.lastUpdated) ? Math.max(0,Math.floor(raw.lastUpdated)) : 0,
  };
}
export function credentials(raw) {
  if (!object(raw) || typeof raw.username !== "string" || typeof raw.password !== "string") invalid("请输入账号和密码。");
  const username=raw.username.normalize("NFKC").trim();
  if(!/^[a-zA-Z0-9_\u4e00-\u9fff.-]{3,32}$/.test(username)) invalid("账号需为 3～32 位中文、字母、数字或 . _ -。");
  if(raw.password.length < 8 || raw.password.length > 128) invalid("密码长度需为 8～128 位。");
  return {username,password:raw.password};
}
export function revisionOf(raw) {
  if(!Number.isSafeInteger(raw) || raw < 0) invalid("请提供有效的档案版本号 revision。");
  return raw;
}
