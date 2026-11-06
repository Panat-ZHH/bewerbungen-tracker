import { Suspense } from "react";
import { JobSearchView } from "@/components/job-search/job-search-view";

export default function JobSearchPage() {
  return (
    <Suspense fallback={null}>
      <JobSearchView />
    </Suspense>
  );
}
