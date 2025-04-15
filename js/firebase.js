// firebase.js

// Configuración de Firebase
const firebaseConfig = {
  apiKey: "AIzaSyAd70p3aEA218oPLWEs_DbMFEotHXfVyNg",
  authDomain: "el-sotano-del-doctor.firebaseapp.com",
  projectId: "el-sotano-del-doctor",
  storageBucket: "el-sotano-del-doctor.appspot.com",
  messagingSenderId: "288654488846",
  appId: "1:288654488846:web:51a726467eaf8e8a88535f",
  measurementId: "G-5N86SGCGW1"
};

// Inicializar Firebase
firebase.initializeApp(firebaseConfig);

// Referencias globales para Firestore y Storage
const db = firebase.firestore();
const storage = firebase.storage();
