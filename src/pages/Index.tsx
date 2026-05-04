// Update this page (the content is just a fallback if you fail to update the page)
import { useNavigate } from "react-router-dom";
import { GraduationCap, Home } from "lucide-react";

export default function Index() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background">
      <div className="w-16 h-16 rounded-full bg-navy flex items-center justify-center mb-4">
        <GraduationCap className="w-8 h-8 text-gold" />
      </div>
      <h1 className="text-2xl font-display font-bold text-navy-dark mb-2">SaCC Alumni Portal</h1>
      <p className="text-muted-foreground mb-6">Please sign in to access the portal.</p>
      <button onClick={() => navigate("/")} className="flex items-center gap-2 px-6 py-3 bg-navy text-white rounded-lg font-medium hover:bg-navy-light transition-colors">
        <Home className="w-4 h-4" /> Go to Login
      </button>
    </div>
  );
}
