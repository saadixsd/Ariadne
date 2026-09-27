import { redirect } from "next/navigation";

/** Settings lives as the account panel over the board — keep the workspace in place. */
export default function SettingsPage() {
  redirect("/?settings=1");
}
