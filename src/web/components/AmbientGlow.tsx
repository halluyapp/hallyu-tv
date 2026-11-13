export function AmbientGlow() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0"
      style={{
        backgroundImage:
          "radial-gradient(ellipse 65% 40% at 25% 0%, rgba(255,94,58,0.12) 0%, transparent 70%), radial-gradient(ellipse 50% 40% at 88% 35%, rgba(99,102,241,0.08) 0%, transparent 70%)",
      }}
    />
  );
}
