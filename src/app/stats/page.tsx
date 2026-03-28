import Link from "next/link";
import { Button } from "@/components/ui/button";
import { MessageSquareIcon } from "lucide-react";

export default function StatsPage() {
  return (
    <div className="flex h-screen items-center justify-center bg-background text-foreground">
      <div className="text-center space-y-4">
        <h1 className="text-2xl font-semibold">Statistics</h1>
        <p className="text-muted-foreground">Coming soon</p>
        <Link href="/chat">
          <Button variant="outline" className="gap-2">
            <MessageSquareIcon className="w-4 h-4" />
            Back to Chat
          </Button>
        </Link>
      </div>
    </div>
  );
}
