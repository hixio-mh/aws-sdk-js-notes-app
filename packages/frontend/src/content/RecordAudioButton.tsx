import React, { useState } from "react";
import { Button, Alert } from "react-bootstrap";
import { MicFill, MicMute } from "react-bootstrap-icons";

import MicrophoneStream from "microphone-stream";

import { pcmEncode } from "../libs/audioUtils";
import { getStreamTranscriptionResponse } from "../libs/getStreamTranscriptionResponse";

const RecordAudioButton = (props: {
  disabled: boolean;
  isRecording: boolean;
  setIsRecording: Function;
  setNoteContent: Function;
}) => {
  const micStream = new MicrophoneStream();
  const { disabled, isRecording, setIsRecording, setNoteContent } = props;
  const [errorMsg, setErrorMsg] = useState("");

  const toggleTrascription = async () => {
    if (isRecording) {
      setIsRecording(false);
      micStream.stop();
    } else {
      setIsRecording(true);
      try {
        const audio = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: false,
        });
        micStream.setStream(audio);
        await streamAudioToWebSocket(micStream);
      } catch (error) {
        console.log(error);
        setErrorMsg(`${error.toString()}`);
      } finally {
        micStream.stop();
        setIsRecording(false);
      }
    }
  };

  const streamAudioToWebSocket = async (micStream: MicrophoneStream) => {
    const pcmEncodeChunk = (audioChunk: Buffer) => {
      const raw = MicrophoneStream.toRaw(audioChunk);
      if (raw == null) return;
      return Buffer.from(pcmEncode(raw));
    };

    const transcribeInput = async function* () {
      // @ts-ignore Type 'MicrophoneStream' is not an array type or a string type.
      for await (const chunk of micStream) {
        yield { AudioEvent: { AudioChunk: pcmEncodeChunk(chunk) } };
      }
    };

    const { TranscriptResultStream } = await getStreamTranscriptionResponse(
      transcribeInput()
    );

    if (TranscriptResultStream) {
      let partialTranscription = "";
      for await (const event of TranscriptResultStream) {
        if (event.TranscriptEvent) {
          const { Results: results } = event.TranscriptEvent.Transcript || {};

          if (results && results.length > 0) {
            if (
              results[0]?.Alternatives &&
              results[0]?.Alternatives?.length > 0
            ) {
              const { Transcript } = results[0].Alternatives[0];

              const transcriptionToRemove = partialTranscription;
              // fix encoding for accented characters.
              const transcription = decodeURIComponent(
                escape(Transcript || "")
              );

              setNoteContent(
                (noteContent: any) =>
                  noteContent.replace(transcriptionToRemove, "") + transcription
              );

              // if this transcript segment is final, reset transcription
              if (!results[0].IsPartial) {
                partialTranscription = "";
              } else {
                partialTranscription = transcription;
              }
            }
          }
        }
      }
    }
  };

  return (
    <>
      {errorMsg && <Alert variant="danger">{errorMsg}</Alert>}
      <Button
        variant={isRecording ? "primary" : "outline-secondary"}
        size="sm"
        onClick={toggleTrascription}
        disabled={disabled}
      >
        {isRecording ? <MicFill /> : <MicMute />}
      </Button>
    </>
  );
};

export { RecordAudioButton };
