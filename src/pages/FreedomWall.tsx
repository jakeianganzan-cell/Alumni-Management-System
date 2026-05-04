import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Heart, MessageCircle, Share2 } from "lucide-react";

export const FreedomWallPost = ({ post }: any) => {
  return (
    <Card className="max-w-2xl mx-auto mb-6 bg-white shadow-sm hover:border-primary/30 transition-colors">
      <CardHeader className="flex flex-row items-center gap-3 space-y-0 p-4">
        <Avatar className="h-10 w-10">
          <AvatarFallback className={post.isAnonymous ? "bg-slate-200" : "bg-primary text-white"}>
            {post.isAnonymous ? "?" : post.userInitials}
          </AvatarFallback>
        </Avatar>
        <div className="flex flex-col">
          <span className="font-semibold text-sm">
            {post.isAnonymous ? "Anonymous User" : post.userName}
          </span>
          <span className="text-xs text-muted-foreground">{post.timestamp}</span>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <p className="text-slate-800 text-base leading-relaxed whitespace-pre-wrap">
          {post.content}
        </p>
        <div className="flex items-center gap-6 mt-4 pt-4 border-t border-slate-50 text-slate-500">
          <button className="flex items-center gap-1.5 hover:text-red-500 transition-colors text-sm font-medium">
            <Heart size={18} /> {post.likes || 0}
          </button>
          <button className="flex items-center gap-1.5 hover:text-primary transition-colors text-sm font-medium">
            <MessageCircle size={18} /> Reply
          </button>
          <button className="ml-auto hover:text-primary transition-colors">
            <Share2 size={18} />
          </button>
        </div>
      </CardContent>
    </Card>
  );
};