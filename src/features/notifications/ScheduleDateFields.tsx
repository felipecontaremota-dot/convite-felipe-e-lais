import { Field } from "../../components/ui";
export function ScheduleDateFields({
  date,
  time,
  setDate,
  setTime,
}: {
  date: string;
  time: string;
  setDate: (v: string) => void;
  setTime: (v: string) => void;
}) {
  return (
    <>
      <Field label="Data (DD/MM/AAAA)" value={date} onChangeText={setDate} />
      <Field label="Horário (24 horas)" value={time} onChangeText={setTime} />
    </>
  );
}
