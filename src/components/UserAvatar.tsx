import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface UserAvatarProps {
  url?: string | null;
  name: string;
  size?: "sm" | "md" | "lg" | "xl";
  isOnline?: boolean;
}

export function UserAvatar({ url, name, size = "md", isOnline }: UserAvatarProps) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadAvatar() {
      if (!url) {
        setSrc(null);
        return;
      }
      if (url.startsWith("http")) {
        setSrc(url);
        return;
      }

      const { data } = await supabase.storage.from("family-media").createSignedUrl(url, 60 * 60 * 24);
      if (isMounted && data?.signedUrl) {
        setSrc(data.signedUrl);
      }
    }

    void loadAvatar();
    return () => { isMounted = false; };
  }, [url]);

  const sizeClasses = {
    sm: "w-8 h-8 text-xs",
    md: "w-11 h-11 text-sm",
    lg: "w-14 h-14 text-base",
    xl: "w-20 h-20 text-2xl",
  }[size];

  return (
    <div className="relative inline-block shrink-0">
      <div className={`${sizeClasses} rounded-full overflow-hidden bg-gradient-to-br from-pink-300 via-rose-300 to-purple-400 border-2 border-white dark:border-slate-800 shadow-xs flex items-center justify-center font-bold text-slate-800`}>
        {src ? (
          <img src={src} alt={name} className="w-full h-full object-cover" onError={() => setSrc(null)} />
        ) : (
          <span>{name?.[0]?.toUpperCase() ?? "?"}</span>
        )}
      </div>

      {isOnline && (
        <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-emerald-500 border-2 border-white dark:border-slate-900 rounded-full shadow-xs" />
      )}
    </div>
  );
}