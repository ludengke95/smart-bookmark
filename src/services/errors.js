/**
 * 结构化服务错误工具 (Service Error)
 *
 * service 层抛出的错误统一携带稳定错误码（err.code），
 * UI 层通过 i18n/utils.js 的 formatServiceError 按码本地化展示。
 * err.message 保留中性英文技术消息作为兜底，err.details 可放调试上下文。
 */
export function serviceError(code, message, params = {}, details) {
  const err = new Error(message || code);
  err.code = code;
  err.params = params || {};
  if (details !== undefined) err.details = details;
  return err;
}
