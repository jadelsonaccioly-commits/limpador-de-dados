import type { ReactNode } from "react";

export type PricingPlanId = "free" | "pro";

type PricingPlansProps = {
  onSelectPlan?: (plan: PricingPlanId) => void;
};

type PlanFeature = {
  label: string;
  included: boolean;
};

type Plan = {
  id: PricingPlanId;
  name: string;
  description: string;
  price: string;
  features: PlanFeature[];
  highlighted?: boolean;
  action: string;
};

const plans: Plan[] = [
  {
    id: "free",
    name: "Gratuito",
    description: "O essencial para começar a organizar seus dados.",
    price: "0",
    action: "Começar Grátis",
    features: [
      { label: "Até 500 linhas por arquivo", included: true },
      { label: "Limpeza básica de duplicados e espaços", included: true },
      { label: "Exportação em CSV", included: true },
      { label: "Limpeza avançada com IA", included: false },
      { label: "Exportação em Excel (.xlsx)", included: false },
    ],
  },
  {
    id: "pro",
    name: "Pro",
    description: "Mais poder para limpar dados sem limites.",
    price: "29",
    action: "Assinar Plano Pro",
    highlighted: true,
    features: [
      { label: "Processamento ILIMITADO de linhas", included: true },
      { label: "Limpeza avançada com IA", included: true },
      { label: "Correção de CPF e CNPJ", included: true },
      { label: "Exportação em CSV e Excel (.xlsx)", included: true },
      { label: "Processamento rápido sem fila", included: true },
      { label: "Suporte prioritário", included: true },
    ],
  },
];

function CheckIcon({ included }: { included: boolean }) {
  return included ? (
    <svg
      aria-hidden="true"
      className="h-5 w-5 shrink-0 text-emerald-500"
      viewBox="0 0 20 20"
      fill="none"
    >
      <path
        d="m5 10 3.2 3.2L15.5 6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  ) : (
    <svg
      aria-hidden="true"
      className="h-5 w-5 shrink-0 text-slate-300"
      viewBox="0 0 20 20"
      fill="none"
    >
      <path
        d="m6.5 6.5 7 7m0-7-7 7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      viewBox="0 0 20 20"
      fill="currentColor"
    >
      <path d="m10 1.5 1.9 5.1L17 8.5l-5.1 1.9L10 15.5l-1.9-5.1L3 8.5l5.1-1.9L10 1.5Zm6 11 1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1 1-2.5Z" />
    </svg>
  );
}

function PlanCard({
  plan,
  onSelectPlan,
}: {
  plan: Plan;
  onSelectPlan?: PricingPlansProps["onSelectPlan"];
}): ReactNode {
  const highlighted = plan.highlighted === true;

  return (
    <article
      className={[
        "relative flex h-full flex-col rounded-3xl border p-7 shadow-sm transition duration-200 hover:-translate-y-1 hover:shadow-xl sm:p-8",
        highlighted
          ? "border-indigo-500 bg-white shadow-indigo-100/70 ring-1 ring-indigo-500 dark:bg-slate-900 dark:shadow-indigo-950/30"
          : "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600",
      ].join(" ")}
    >
      {highlighted && (
        <span className="absolute -top-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white shadow-md shadow-indigo-200 dark:shadow-indigo-950">
          <SparkleIcon />
          Recomendado
        </span>
      )}

      <div>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
          Plano {plan.name}
        </h3>
        <p className="mt-2 min-h-10 text-sm leading-6 text-slate-500 dark:text-slate-400">
          {plan.description}
        </p>
      </div>

      <div className="mt-7 flex items-end gap-2">
        <span className="pb-1 text-sm font-medium text-slate-500 dark:text-slate-400">
          R$
        </span>
        <span className="text-5xl font-bold tracking-tight text-slate-950 dark:text-white">
          {plan.price}
        </span>
        <span className="pb-1.5 text-sm text-slate-500 dark:text-slate-400">
          /mês
        </span>
      </div>

      <ul className="mt-8 flex-1 space-y-4">
        {plan.features.map((feature) => (
          <li
            key={feature.label}
            className={[
              "flex items-start gap-3 text-sm leading-5",
              feature.included
                ? "text-slate-700 dark:text-slate-200"
                : "text-slate-400 dark:text-slate-500",
            ].join(" ")}
          >
            <CheckIcon included={feature.included} />
            <span>{feature.label}</span>
          </li>
        ))}
      </ul>

      <button
        className={[
          "mt-9 inline-flex min-h-12 w-full items-center justify-center rounded-xl px-5 py-3 text-sm font-semibold transition focus:outline-none focus-visible:ring-4",
          highlighted
            ? "bg-indigo-600 text-white shadow-lg shadow-indigo-200 hover:bg-indigo-700 focus-visible:ring-indigo-200 dark:shadow-indigo-950 dark:focus-visible:ring-indigo-900"
            : "border border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50 focus-visible:ring-slate-200 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800 dark:focus-visible:ring-slate-700",
        ].join(" ")}
        type="button"
        onClick={() => onSelectPlan?.(plan.id)}
      >
        {plan.action}
      </button>
    </article>
  );
}

export default function PricingPlans({ onSelectPlan }: PricingPlansProps) {
  return (
    <section
      aria-labelledby="pricing-title"
      className="bg-slate-50 px-5 py-20 dark:bg-slate-950 sm:px-8 lg:py-24"
    >
      <div className="mx-auto max-w-5xl">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-indigo-600 dark:text-indigo-400">
            Planos DataClean BR
          </p>
          <h2
            id="pricing-title"
            className="mt-3 text-3xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-4xl"
          >
            Escolha o plano ideal para você
          </h2>
          <p className="mt-4 text-base leading-7 text-slate-600 dark:text-slate-400">
            Comece grátis e avance para o Pro quando precisar de mais capacidade.
          </p>
        </div>

        <div className="mx-auto mt-14 grid max-w-4xl grid-cols-1 items-stretch gap-6 md:grid-cols-2 md:gap-8">
          {plans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              onSelectPlan={onSelectPlan}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
