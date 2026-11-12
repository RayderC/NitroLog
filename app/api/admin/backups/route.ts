import { route } from "@/lib/api";
import { backupConfig } from "@/lib/backup";
import { listBackups, makeBackup } from "@/lib/backupCore";

export const GET = route(() => ({ backups: listBackups(backupConfig), folder: backupConfig.dir }), { admin: true });
export const POST = route(() => makeBackup(backupConfig, "manual"), { admin: true });
