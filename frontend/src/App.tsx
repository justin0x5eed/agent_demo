import Counter from './components/Counter'
import Progress from './components/Progress'

function App() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-base-200 p-6 text-base-content">
      <div className="grid w-full max-w-5xl gap-8 lg:grid-cols-2">
        <Counter />
        <Progress />
      </div>
    </div>
  )
}

export default App
