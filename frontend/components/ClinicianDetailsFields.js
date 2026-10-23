import { useLocale } from "../context/LocaleContext";
import styles from '../styles/auth.module.css';
export default function ClinicianDetailsFields({
  value,
  onChange,
  disabled = false
}) {
  const {
    t
  } = useLocale();
  const fields = [['professional_title', 'Professional title', 'Speech-language pathologist', 120, true], ['registration_number', 'Professional registration / licence number', 'Your registration number', 120, true], ['jurisdiction', 'Registration authority / country', 'For example, RCI · India', 120, true], ['organization', 'Clinic or organization (optional)', 'Where you practise', 160, false]];
  return <fieldset className={styles.professionalFields} disabled={disabled}>
    <legend>{t("Professional details")}</legend>
    <p>{t("These details are submitted for review. Clinician access begins after approval.")}</p>
    {fields.map(([key, label, placeholder, maxLength, required]) => <div className={styles.inputGroup} key={key}>
      <label htmlFor={`clinician-${key}`}>{t(label)}</label>
      <input id={`clinician-${key}`} className={styles.inputField} value={value[key] || ''} onChange={event => onChange({
        ...value,
        [key]: event.target.value
      })} minLength={required ? 2 : undefined} maxLength={maxLength} required={required} placeholder={t(placeholder)} />
    </div>)}
  </fieldset>;
}
