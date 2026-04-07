import { Button } from "@/components/ui/button";

const Index = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="max-w-4xl mx-auto px-6 text-center">
        <h1 className="text-6xl md:text-8xl font-bold text-foreground mb-6 tracking-tight animate-fade-in">
          OptiDev
        </h1>
        <p className="text-xl md:text-2xl text-muted-foreground leading-relaxed animate-slide-up">
          <span className="text-secondary-foreground font-medium">
            Start building something amazing.
          </span>
        </p>
        <div className="mt-12 animate-fade-in">
          <Button variant="default">Ready when you are</Button>
        </div>
      </div>
    </div>
  );
};

export default Index;
