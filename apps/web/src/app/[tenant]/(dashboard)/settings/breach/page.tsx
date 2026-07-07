import { BreachRegister } from "./_components/breach-register";

export default function BreachRegisterPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Breach Register</h1>
        <p className="text-sm text-muted-foreground">
          Record personal-data breaches and track NPC notification deadlines (PH
          Data Privacy Act / NPC Circular 16-03). Administrators only.
        </p>
      </div>
      <BreachRegister />
    </div>
  );
}
