import Link from 'next/link';
import useAAC from '../hooks/useAAC';
export function AACVisibility({children}){const {enabled}=useAAC();return enabled?children:null;}
export default function AACLink(props){const {enabled}=useAAC();return enabled?<Link {...props}/>:null;}
