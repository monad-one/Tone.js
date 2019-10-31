import { Signal } from "../signal/Signal";
import { Multiply } from "../signal/Multiply";
import { Gain } from "../core/context/Gain";
import { Positive, Seconds } from "../core/type/Units";
import { Envelope, EnvelopeOptions } from "../component/envelope/Envelope";
import { ToneAudioNode, ToneAudioNodeOptions } from "../core/context/ToneAudioNode";
import { Monophonic } from "./Monophonic";
import { OmniOscillator } from "../source/oscillator/OmniOscillator";
import { OmniOscillatorSynthOptions } from "../source/oscillator/OscillatorInterface";
import { Source } from "../source/Source";
import { Synth, SynthOptions } from "./Synth";
import { AmplitudeEnvelope } from "../component/envelope/AmplitudeEnvelope";
import { readOnly, RecursivePartial } from "../core/util/Interface";
import { omitFromObject, optionsFromArguments } from "../core/util/Defaults";
import { EQ } from "../core/util/Math";

export interface ModulationSynthOptions extends SynthOptions {
	harmonicity: Positive;
	modulationEnvelope: Omit<EnvelopeOptions, keyof ToneAudioNodeOptions>;
	modulation: OmniOscillatorSynthOptions;
}
/**
 * Base class for both AM and FM synths
 */
export abstract class ModulationSynth<Options extends ModulationSynthOptions> extends Monophonic<Options> {

	readonly name: string = "ModulationSynth";

	/**
	 * The carrier voice.
	 */
	protected _carrier: Synth;

	/**
	 * The modulator voice.
	 */

	protected _modulator: Synth;

	/**
	 * The carrier's oscillator
	 */
	readonly oscillator: OmniOscillator<any>;

	/**
	 * The carrier's envelope
	 */
	readonly envelope: AmplitudeEnvelope;

	/**
	 * The modulator's oscillator which is applied to the amplitude of the oscillator
	 */
	readonly modulation: OmniOscillator<any>;

	/**
	 * The modulator's envelope
	 */
	readonly modulationEnvelope: AmplitudeEnvelope;

	/**
	 * The frequency control
	 */
	readonly frequency: Signal<"frequency">;

	/**
	 * The detune in cents
	 */
	readonly detune: Signal<"cents">;

	/**
	 * Harmonicity is the ratio between the two voices. A harmonicity of
	 * 1 is no change. Harmonicity = 2 means a change of an octave.
	 * @example
	 * import { AMSynth } from "tone";
	 * const amSynth = new AMSynth().toDestination();
	 * // pitch the modulator an octave below oscillator
	 * amSynth.harmonicity.value = 0.5;
	 * amSynth.triggerAttackRelease("C5", "4n");
	 */
	readonly harmonicity: Multiply;

	/**
	 * The node where the modulation happens
	 */
	protected _modulationNode: Gain;

	constructor(options?: RecursivePartial<ModulationSynthOptions>);
	constructor() {
		super(optionsFromArguments(ModulationSynth.getDefaults(), arguments));
		const options = optionsFromArguments(ModulationSynth.getDefaults(), arguments);

		this._carrier = new Synth({
			context: this.context,
			oscillator: options.oscillator,
			envelope: options.envelope,
			onsilence: this._onsilence.bind(this),
			volume: -10,
		});
		this._modulator = new Synth({
			context: this.context,
			oscillator: options.modulation,
			envelope: options.modulationEnvelope,
			onsilence: this._onsilence.bind(this),
			volume: -10,
		});

		this.oscillator = this._carrier.oscillator;
		this.envelope = this._carrier.envelope;
		this.modulation = this._modulator.oscillator;
		this.modulationEnvelope = this._modulator.envelope;

		this.frequency = new Signal({
			context: this.context,
			units: "frequency",
		});
		this.detune = new Signal({
			context: this.context,
			value: options.detune,
			units: "cents"
		});
		this.harmonicity = new Multiply({
			context: this.context,
			value: options.harmonicity,
		});
		this._modulationNode = new Gain({
			context: this.context,
			gain: 0,
		});
		
		readOnly(this, ["frequency", "harmonicity", "oscillator", "envelope", "modulation", "modulationEnvelope", "detune"]);
	}

	static getDefaults(): ModulationSynthOptions {
		return Object.assign(Monophonic.getDefaults(), {
			harmonicity: 3,
			oscillator: Object.assign(
				omitFromObject(OmniOscillator.getDefaults(), [
					...Object.keys(Source.getDefaults()),
					"frequency",
					"detune"
				]),
				{
					type: "sine"
				}
			),
			envelope: Object.assign(
				omitFromObject(
					Envelope.getDefaults(),
					Object.keys(ToneAudioNode.getDefaults())
				),
				{
					attack: 0.01,
					decay: 0.01,
					sustain: 1,
					release: 0.5
				}
			),
			modulation: Object.assign(
				omitFromObject(OmniOscillator.getDefaults(), [
					...Object.keys(Source.getDefaults()),
					"frequency",
					"detune"
				]),
				{
					type: "square"
				}
			),
			modulationEnvelope: Object.assign(
				omitFromObject(
					Envelope.getDefaults(),
					Object.keys(ToneAudioNode.getDefaults())
				),
				{
					attack: 0.5,
					decay: 0.0,
					sustain: 1,
					release: 0.5
				}
			)
		});
	}

	private _onsilence() {
		const totalEnvelope = this.modulationEnvelope.getValueAtTime(this.now()) + this.envelope.getValueAtTime(this.now());
		if (EQ(totalEnvelope, 0)) {
			this.onsilence(this);
		}
	}
		
	/**
	 * Trigger the attack portion of the note
	 */
	protected _triggerEnvelopeAttack(time: Seconds, velocity: number): void {
		// @ts-ignore
		this._carrier._triggerEnvelopeAttack(time, velocity);
		// @ts-ignore
		this._modulator._triggerEnvelopeAttack(time, velocity);
	}
	
	/**
	 * Trigger the release portion of the note
	 */
	protected _triggerEnvelopeRelease(time: Seconds) {
		// @ts-ignore
		this._carrier._triggerEnvelopeRelease(time);
		// @ts-ignore
		this._modulator._triggerEnvelopeRelease(time);
		return this;
	}

	dispose(): this {
		super.dispose();
		this._carrier.dispose();
		this._modulator.dispose();
		this.frequency.dispose();
		this.detune.dispose();
		this.harmonicity.dispose();
		this._modulationNode.dispose();
		return this;
	}
}
