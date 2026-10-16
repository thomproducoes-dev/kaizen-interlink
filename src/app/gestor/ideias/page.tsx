import { redirect } from "next/navigation";

export default function Ideias() {
  redirect("/gestor/fila?f=todas");
}
