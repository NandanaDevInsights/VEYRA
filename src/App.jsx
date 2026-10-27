import LoginAction from "./Components/loginaction.jsx";
import ErrorBoundary from "./Components/ErrorBoundary.jsx";
import "./App.css";

function App() {
  return (
    <ErrorBoundary>
      <div className="App">
        <LoginAction />
      </div>
    </ErrorBoundary>
  );
}

export default App;
