import Head from 'next/head';
import Navbar from '../components/Navbar';
import ProtectedRoute from '../components/ProtectedRoute';
import AACSetting from '../components/AACSetting';
import styles from '../styles/workspace.module.css';
export default function Settings(){return <ProtectedRoute><Head><title>{"Settings · Speation"}</title></Head><Navbar/><main lang="en" translate="no" className={styles.main}><h1>Settings</h1><div className={styles.panel}><AACSetting/></div></main></ProtectedRoute>;}
