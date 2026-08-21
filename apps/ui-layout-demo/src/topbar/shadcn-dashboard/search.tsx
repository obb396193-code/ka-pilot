import { Input } from "./ui/input";

export function Search() {
  return (
    <div>
      <Input
        type="search"
        aria-label="全局搜索"
        placeholder="搜索计划、账户或素材…"
        className="md:w-[140px] lg:w-[260px]"
      />
    </div>
  );
}
