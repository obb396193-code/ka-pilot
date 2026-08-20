const currency = new Intl.NumberFormat("zh-CN", {
  style: "currency",
  currency: "CNY",
  minimumFractionDigits: 2,
});

const compactCurrency = new Intl.NumberFormat("zh-CN", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const percent = new Intl.NumberFormat("zh-CN", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const integer = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 });

const dateTime = new Intl.DateTimeFormat("zh-CN", {
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Shanghai",
});

export const formatCurrency = (value: number) => currency.format(value);
export const formatCompactCurrency = (value: number) =>
  `¥${compactCurrency.format(value)}`;
export const formatPercent = (value: number) => percent.format(value);
export const formatInteger = (value: number) => integer.format(value);
export const formatDateTime = (value: string | Date) =>
  dateTime.format(new Date(value));
