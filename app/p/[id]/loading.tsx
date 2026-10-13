// Skeleton only for the heavy app views. Not at the root: a root loading boundary streams
// every page, so notFound() (e.g. /admin for non-admins) could only answer 200.
export { default } from "@/components/WorkspaceLoading";
