export function App() {
  let count = 0;
  const doubled = count * 2;

  return (
    <div>
      <h1 data-testid="heading">Hello HMR</h1>
      <p data-testid="counter-display">Count: {count}</p>
      <p data-testid="derived-display">Doubled: {doubled}</p>
      <button
        type="button"
        data-testid="increment-btn"
        onClick={() => {
          count++;
        }}
      >
        Increment
      </button>
      <input data-testid="text-input" name="text-input" placeholder="Type here" />
      <div
        id="scroll-area"
        data-testid="scroll-container"
        style={{ height: '100px', overflow: 'auto' }}
      >
        <div style={{ height: '500px' }}>Scrollable content</div>
      </div>
    </div>
  );
}
