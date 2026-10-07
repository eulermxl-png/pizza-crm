-- 0063_concept_rubro.sql
-- Cada concepto de gasto lleva su rubro (Servicios, Renta, Nómina…). Al capturar un gasto
-- con concepto se guarda ese rubro en expenses.category, como se hacía antes de los
-- conceptos. Así el estado de resultados separa igual los gastos viejos y los nuevos,
-- y el agente deja de marcar "Gasto de operación → Servicios". Idempotente.

alter table public.expense_concepts add column if not exists expense_category text;

update public.expense_concepts set expense_category = case
    when is_payroll then 'Nómina'
    when name in ('Luz (CFE)', 'Agua (CESPM)', 'Internet / Teléfono', 'Gas', 'Otros servicios') then 'Servicios'
    when name = 'Renta' then 'Renta'
    when name ilike 'Mantenimiento%' then 'Mantenimiento'
    else expense_category
  end
where expense_category is null and accounting_category = 'Gasto de operación';

-- Corrige los gastos ya capturados con concepto (descripción = nombre del concepto,
-- o "Nómina — Trabajador") que quedaron como "Gasto de operación".
update public.expenses e
   set category = c.expense_category
  from public.expense_concepts c
 where e.category = 'Gasto de operación'
   and c.expense_category is not null
   and (e.description = c.name or (c.is_payroll and e.description like c.name || ' — %'));
