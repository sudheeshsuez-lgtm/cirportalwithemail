import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyAccount } from "@/lib/portal.functions";

export function useAccount() {
  const fetchAccount = useServerFn(getMyAccount);
  return useQuery({ queryKey: ["account"], queryFn: () => fetchAccount() });
}
