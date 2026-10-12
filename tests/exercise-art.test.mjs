import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inferExerciseArt} from '../frontend/exercise-art-data.mjs';
test('Exercícios específicos recebem desenho compatível e nomes não reconhecidos ficam para seleção manual',()=>{
 for(const [title,key] of [['Agachamento com apoio','squat'],['Agachamento em base dividida','lunge'],['Subida em degrau','step'],['Ponte de quadril','bridge'],['Extensão de joelho sentado','knee'],['Elevação unilateral de panturrilha','calf'],['Elevação de calcanhar sentado','seated'],['Extensão de punho com peso','wrist'],['Flexão de braços na bancada','push'],['Dorsiflexão com elástico','foot'],['Prancha lateral','plank'],['Exercício individual sem nome reconhecido','general']])assert.equal(inferExerciseArt(title),key,title);
});
