import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { gateway } from "../api/adapter";
import { apiUrl, mode } from "../api/config";
import { entitled } from "../domain/models";
export function useData() {
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => gateway.me(),
    enabled: mode !== "unconfigured",
  });
  const enabled = !!me.data && (mode === "demo" || entitled(me.data.switch));
  const recipients = useQuery({
    queryKey: ["recipients", me.data?.user.id],
    queryFn: () => gateway.recipients(),
    enabled,
  });
  const messages = useQuery({
    queryKey: ["messages", me.data?.user.id],
    queryFn: () => gateway.messages(),
    enabled,
  });
  return {
    me,
    recipients,
    messages,
    scope: `${apiUrl ?? mode}:${me.data?.user.id ?? "unavailable"}`,
    ready: enabled,
  };
}
export function useOperation<T>(fn: (input: T) => Promise<void>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    retry: false,
    onSuccess: async () => {
      await client.invalidateQueries();
    },
  });
}
