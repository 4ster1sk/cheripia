<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<div v-if="room.isEnded" :class="$style.kyokuResult">
		<div :class="$style.kyokuResultCard">
			<div :class="$style.kyokuResultTitle">対局終了</div>
			<div v-for="house in houses" :key="house" :class="[$style.kyokuResultRow, $style.kyokuResultRowCompact]">
				<div :class="$style.kyokuResultHouseRow">
					<span :class="$style.kyokuResultHouse">{{ houseLabel(house) }}</span>
					<template v-if="houseToUser(house) != null">
						<MkAvatar :user="houseToUser(house)!" :class="$style.kyokuResultAvatar"/>
						<span :class="$style.kyokuResultName">{{ houseToUser(house)!.name ?? houseToUser(house)!.username }}</span>
					</template>
					<span v-else :class="$style.kyokuResultName">CPU</span>
					<span :class="$style.kyokuResultEndPoints">{{ mj.points[house] }}点</span>
				</div>
			</div>
			<div :class="$style.kyokuResultFooter">
				<MkButton primary @click="backToLobby">ロビーに戻る</MkButton>
			</div>
		</div>
	</div>
	<div :class="$style.statusBar">
		<div :class="$style.statusBarLeft">
			<div :class="$style.roundInfo">{{ roundLabel }}</div>
			<div v-if="timerVisible" :class="$style.turnTimer">{{ timerLabel }}</div>
		</div>
		<div :class="$style.doraIndicators">
			<span :class="$style.doraIndicatorLabel">{{ i18n.ts._mahjong.dora }}</span>
			<XTile v-for="tile in mj.doraIndicateTiles" :key="tile" :tile="mj$(tile)" variation="1" :doras="[]"/>
		</div>
	</div>
	<div :class="$style.taku">
		<div :class="$style.centerPanel">
			<div style="text-align: center;">
				<div :class="$style.centerPanelTickerToi">
					<div style="position: absolute; left: 10px; bottom: 5px;">
						<span :class="$style.centerPanelHouse">{{ Mmj.prevHouse(Mmj.prevHouse(mj.myHouse)) === 'e' ? i18n.ts._mahjong.east : Mmj.prevHouse(Mmj.prevHouse(mj.myHouse)) === 's' ? i18n.ts._mahjong.south : Mmj.prevHouse(Mmj.prevHouse(mj.myHouse)) === 'w' ? i18n.ts._mahjong.west : i18n.ts._mahjong.north }}</span>
						<span :class="$style.centerPanelPoint">{{ mj.points[Mmj.prevHouse(Mmj.prevHouse(mj.myHouse))] }}</span>
					</div>
				</div>
				<div :class="$style.centerPanelTickerKami">
					<div style="position: absolute; left: 10px; bottom: 5px;">
						<span :class="$style.centerPanelHouse">{{ Mmj.prevHouse(mj.myHouse) === 'e' ? i18n.ts._mahjong.east : Mmj.prevHouse(mj.myHouse) === 's' ? i18n.ts._mahjong.south : Mmj.prevHouse(mj.myHouse) === 'w' ? i18n.ts._mahjong.west : i18n.ts._mahjong.north }}</span>
						<span :class="$style.centerPanelPoint">{{ mj.points[Mmj.prevHouse(mj.myHouse)] }}</span>
					</div>
				</div>
				<div :class="$style.centerPanelTickerSimo">
					<div style="position: absolute; left: 10px; bottom: 5px;">
						<span :class="$style.centerPanelHouse">{{ Mmj.nextHouse(mj.myHouse) === 'e' ? i18n.ts._mahjong.east : Mmj.nextHouse(mj.myHouse) === 's' ? i18n.ts._mahjong.south : Mmj.nextHouse(mj.myHouse) === 'w' ? i18n.ts._mahjong.west : i18n.ts._mahjong.north }}</span>
						<span :class="$style.centerPanelPoint">{{ mj.points[Mmj.nextHouse(mj.myHouse)] }}</span>
					</div>
				</div>
				<div :class="$style.centerPanelTickerMe">
					<div style="position: absolute; left: 10px; bottom: 5px;">
						<span :class="$style.centerPanelHouse">{{ mj.myHouse === 'e' ? i18n.ts._mahjong.east : mj.myHouse === 's' ? i18n.ts._mahjong.south : mj.myHouse === 'w' ? i18n.ts._mahjong.west : i18n.ts._mahjong.north }}</span>
						<span :class="$style.centerPanelPoint">{{ mj.points[mj.myHouse] }}</span>
					</div>
				</div>
				<div :class="$style.centerPanelIndicatorContainerToi">
					<div style="position: absolute; left: 0; right: 0; bottom: 0;">
						<div :class="[$style.centerPanelIndicator, { [$style.centerPanelIndicatorIndicated]: mj.turn === Mmj.prevHouse(Mmj.prevHouse(mj.myHouse)) }]"></div>
					</div>
				</div>
				<div :class="$style.centerPanelIndicatorContainerKami">
					<div style="position: absolute; left: 0; right: 0; bottom: 0;">
						<div :class="[$style.centerPanelIndicator, { [$style.centerPanelIndicatorIndicated]: mj.turn === Mmj.prevHouse(mj.myHouse) }]"></div>
					</div>
				</div>
				<div :class="$style.centerPanelIndicatorContainerSimo">
					<div style="position: absolute; left: 0; right: 0; bottom: 0;">
						<div :class="[$style.centerPanelIndicator, { [$style.centerPanelIndicatorIndicated]: mj.turn === Mmj.nextHouse(mj.myHouse) }]"></div>
					</div>
				</div>
				<div :class="$style.centerPanelIndicatorContainerMe">
					<div style="position: absolute; left: 0; right: 0; bottom: 0;">
						<div :class="[$style.centerPanelIndicator, { [$style.centerPanelIndicatorIndicated]: mj.turn === mj.myHouse }]"></div>
					</div>
				</div>
				<div :class="$style.centerPanelContent">
					<div>{{ mj.tilesCount }}</div>
					<div v-if="waitTiles.length > 0" :class="$style.waitTiles">
						<div :class="$style.waitTilesLabel">{{ i18n.ts._mahjong.waitTiles }}</div>
						<div :class="$style.waitTilesList">
							<XTile v-for="tile in waitTiles" :key="tile" :tile="mj$(tileTypeToTileId(tile))" variation="1" :doras="[]"/>
						</div>
					</div>
				</div>
			</div>
		</div>

		<div :class="$style.handTilesOfToimen">
			<div v-for="tile in mj.handTiles[Mmj.prevHouse(Mmj.prevHouse(mj.myHouse))]" style="display: inline-block;">
				<img :src="`/client-assets/mahjong/tile-back.png`" :class="$style.handTileImgOfToimen"/>
			</div>
		</div>

		<div :class="$style.handTilesOfKamitya">
			<div v-for="tile in mj.handTiles[Mmj.prevHouse(mj.myHouse)]" :class="$style.sideTile">
				<img :src="`/client-assets/mahjong/tile-side.png`" style="display: inline-block; width: 32px;"/>
			</div>
		</div>

		<div :class="$style.handTilesOfSimotya">
			<div v-for="tile in mj.handTiles[Mmj.nextHouse(mj.myHouse)]" :class="$style.sideTile">
				<img :src="`/client-assets/mahjong/tile-side.png`" style="display: inline-block; width: 32px; scale: -1 1;"/>
			</div>
		</div>

		<div :class="$style.huroTilesOfToimen">
			<XHuro v-for="huro in mj.huros[Mmj.prevHouse(Mmj.prevHouse(mj.myHouse))]" :huro="huro" variation="1" :doras="mj.doras"/>
		</div>

		<div :class="$style.huroTilesOfKamitya">
			<XHuro v-for="huro in mj.huros[Mmj.prevHouse(mj.myHouse)]" :huro="huro" variation="1" :doras="mj.doras"/>
		</div>

		<div :class="$style.huroTilesOfSimotya">
			<XHuro v-for="huro in mj.huros[Mmj.nextHouse(mj.myHouse)]" :huro="huro" variation="1" :doras="mj.doras"/>
		</div>

		<div :class="$style.huroTilesOfMe">
			<XHuro v-for="huro in mj.huros[mj.myHouse]" :huro="huro" variation="1" :doras="mj.doras"/>
		</div>

		<div :class="$style.hoTilesContainer">
			<div :class="$style.hoTilesContainerOfToimen">
				<div :class="$style.hoTilesOfToimen">
					<div v-for="(tile, i) in mj.hoTiles[Mmj.prevHouse(Mmj.prevHouse(mj.myHouse))]" :class="[$style.hoTile, { [$style.callTarget]: isCallTarget(Mmj.prevHouse(Mmj.prevHouse(mj.myHouse)), i, mj.hoTiles[Mmj.prevHouse(Mmj.prevHouse(mj.myHouse))].length) }]" :style="{ zIndex: mj.hoTiles[Mmj.prevHouse(Mmj.prevHouse(mj.myHouse))].length - i }">
						<XTile :tile="mj$(tile)" variation="2" :doras="mj.doras"/>
					</div>
				</div>
			</div>
			<div :class="$style.hoTilesContainerOfKamitya">
				<div :class="$style.hoTilesOfKamitya">
					<div v-for="(tile, i) in mj.hoTiles[Mmj.prevHouse(mj.myHouse)]" :class="[$style.hoTile, { [$style.callTarget]: isCallTarget(Mmj.prevHouse(mj.myHouse), i, mj.hoTiles[Mmj.prevHouse(mj.myHouse)].length) }]">
						<XTile :tile="mj$(tile)" variation="4" :doras="mj.doras"/>
					</div>
				</div>
			</div>
			<div :class="$style.hoTilesContainerOfSimotya">
				<div :class="$style.hoTilesOfSimotya">
					<div v-for="(tile, i) in mj.hoTiles[Mmj.nextHouse(mj.myHouse)]" :class="[$style.hoTile, { [$style.callTarget]: isCallTarget(Mmj.nextHouse(mj.myHouse), i, mj.hoTiles[Mmj.nextHouse(mj.myHouse)].length) }]" :style="{ zIndex: mj.hoTiles[Mmj.nextHouse(mj.myHouse)].length - i }">
						<XTile :tile="mj$(tile)" variation="5" :doras="mj.doras"/>
					</div>
				</div>
			</div>
			<div :class="$style.hoTilesContainerOfMe">
				<div :class="$style.hoTilesOfMe">
					<div v-for="(tile, i) in mj.hoTiles[mj.myHouse]" :class="[$style.hoTile, { [$style.callTarget]: isCallTarget(mj.myHouse, i, mj.hoTiles[mj.myHouse].length) }]">
						<XTile :tile="mj$(tile)" variation="1" :doras="mj.doras"/>
					</div>
				</div>
			</div>
		</div>

		<div :class="$style.playersContainer">
			<div :class="[$style.playerOfToimen, $style.player]">
				<span :class="$style.playerHouse">{{ houseLabel(Mmj.prevHouse(Mmj.prevHouse(mj.myHouse))) }}</span>
				<template v-if="users[Mmj.prevHouse(Mmj.prevHouse(mj.myHouse))] != null">
					<MkAvatar :user="users[Mmj.prevHouse(Mmj.prevHouse(mj.myHouse))]!" style="width: 30px; height: 30px;"/>
					<span :class="$style.playerName">{{ users[Mmj.prevHouse(Mmj.prevHouse(mj.myHouse))]!.name ?? users[Mmj.prevHouse(Mmj.prevHouse(mj.myHouse))]!.username }}</span>
				</template>
				<template v-else>
					<span :class="$style.playerName">CPU</span>
				</template>
			</div>
			<div :class="[$style.playerOfKamitya, $style.player]">
				<span :class="$style.playerHouse">{{ houseLabel(Mmj.prevHouse(mj.myHouse)) }}</span>
				<template v-if="users[Mmj.prevHouse(mj.myHouse)] != null">
					<MkAvatar :user="users[Mmj.prevHouse(mj.myHouse)]!" style="width: 30px; height: 30px;"/>
					<span :class="$style.playerName">{{ users[Mmj.prevHouse(mj.myHouse)]!.name ?? users[Mmj.prevHouse(mj.myHouse)]!.username }}</span>
				</template>
				<template v-else>
					<span :class="$style.playerName">CPU</span>
				</template>
			</div>
			<div :class="[$style.playerOfSimotya, $style.player]">
				<span :class="$style.playerHouse">{{ houseLabel(Mmj.nextHouse(mj.myHouse)) }}</span>
				<template v-if="users[Mmj.nextHouse(mj.myHouse)] != null">
					<MkAvatar :user="users[Mmj.nextHouse(mj.myHouse)]!" style="width: 30px; height: 30px;"/>
					<span :class="$style.playerName">{{ users[Mmj.nextHouse(mj.myHouse)]!.name ?? users[Mmj.nextHouse(mj.myHouse)]!.username }}</span>
				</template>
				<template v-else>
					<span :class="$style.playerName">CPU</span>
				</template>
			</div>
			<div :class="[$style.playerOfMe, $style.player]">
				<span :class="$style.playerHouse">{{ houseLabel(mj.myHouse) }}</span>
				<template v-if="users[mj.myHouse] != null">
					<MkAvatar :user="users[mj.myHouse]!" style="width: 30px; height: 30px;"/>
					<span :class="$style.playerName">{{ users[mj.myHouse]!.name ?? users[mj.myHouse]!.username }}</span>
				</template>
				<template v-else>
					<span :class="$style.playerName">CPU</span>
				</template>
			</div>
		</div>

		<XHandTiles :class="$style.handTilesOfMe" :tiles="mj.myHandTiles" :doras="mj.doras" :selectableTiles="selectableTiles" :separateLast="isMyTurn && mj.drawnTile != null" @choose="chooseTile"/>

		<div :class="$style.serifContainer">
			<div :class="$style.serifContainerOfToimen">
				<Transition
					:enterActiveClass="$style.transition_serif_enterActive"
					:leaveActiveClass="$style.transition_serif_leaveActive"
					:enterFromClass="$style.transition_serif_enterFrom"
					:leaveToClass="$style.transition_serif_leaveTo"
				>
					<img v-if="ronSerifHouses[Mmj.prevHouse(Mmj.prevHouse(mj.myHouse))]" :src="`/client-assets/mahjong/ron.png`" style="display: block; width: 100%;"/>
					<img v-else-if="ciiSerifHouses[Mmj.prevHouse(Mmj.prevHouse(mj.myHouse))]" :src="`/client-assets/mahjong/cii.png`" style="display: block; width: 100%;"/>
					<img v-else-if="ponSerifHouses[Mmj.prevHouse(Mmj.prevHouse(mj.myHouse))]" :src="`/client-assets/mahjong/pon.png`" style="display: block; width: 100%;"/>
					<img v-else-if="kanSerifHouses[Mmj.prevHouse(Mmj.prevHouse(mj.myHouse))]" :src="`/client-assets/mahjong/kan.png`" style="display: block; width: 100%;"/>
					<img v-else-if="tsumoSerifHouses[Mmj.prevHouse(Mmj.prevHouse(mj.myHouse))]" :src="`/client-assets/mahjong/tsumo.png`" style="display: block; width: 100%;"/>
					<img v-else-if="riichiSerifHouses[Mmj.prevHouse(Mmj.prevHouse(mj.myHouse))]" :src="`/client-assets/mahjong/riichi.png`" style="display: block; width: 100%;"/>
				</Transition>
			</div>
			<div :class="$style.serifContainerOfKamitya">
				<Transition
					:enterActiveClass="$style.transition_serif_enterActive"
					:leaveActiveClass="$style.transition_serif_leaveActive"
					:enterFromClass="$style.transition_serif_enterFrom"
					:leaveToClass="$style.transition_serif_leaveTo"
				>
					<img v-if="ronSerifHouses[Mmj.prevHouse(mj.myHouse)]" :src="`/client-assets/mahjong/ron.png`" style="display: block; width: 100%;"/>
					<img v-else-if="ciiSerifHouses[Mmj.prevHouse(mj.myHouse)]" :src="`/client-assets/mahjong/cii.png`" style="display: block; width: 100%;"/>
					<img v-else-if="ponSerifHouses[Mmj.prevHouse(mj.myHouse)]" :src="`/client-assets/mahjong/pon.png`" style="display: block; width: 100%;"/>
					<img v-else-if="kanSerifHouses[Mmj.prevHouse(mj.myHouse)]" :src="`/client-assets/mahjong/kan.png`" style="display: block; width: 100%;"/>
					<img v-else-if="tsumoSerifHouses[Mmj.prevHouse(mj.myHouse)]" :src="`/client-assets/mahjong/tsumo.png`" style="display: block; width: 100%;"/>
					<img v-else-if="riichiSerifHouses[Mmj.prevHouse(mj.myHouse)]" :src="`/client-assets/mahjong/riichi.png`" style="display: block; width: 100%;"/>
				</Transition>
			</div>
			<div :class="$style.serifContainerOfSimotya">
				<Transition
					:enterActiveClass="$style.transition_serif_enterActive"
					:leaveActiveClass="$style.transition_serif_leaveActive"
					:enterFromClass="$style.transition_serif_enterFrom"
					:leaveToClass="$style.transition_serif_leaveTo"
				>
					<img v-if="ronSerifHouses[Mmj.nextHouse(mj.myHouse)]" :src="`/client-assets/mahjong/ron.png`" style="display: block; width: 100%;"/>
					<img v-else-if="ciiSerifHouses[Mmj.nextHouse(mj.myHouse)]" :src="`/client-assets/mahjong/cii.png`" style="display: block; width: 100%;"/>
					<img v-else-if="ponSerifHouses[Mmj.nextHouse(mj.myHouse)]" :src="`/client-assets/mahjong/pon.png`" style="display: block; width: 100%;"/>
					<img v-else-if="kanSerifHouses[Mmj.nextHouse(mj.myHouse)]" :src="`/client-assets/mahjong/kan.png`" style="display: block; width: 100%;"/>
					<img v-else-if="tsumoSerifHouses[Mmj.nextHouse(mj.myHouse)]" :src="`/client-assets/mahjong/tsumo.png`" style="display: block; width: 100%;"/>
					<img v-else-if="riichiSerifHouses[Mmj.nextHouse(mj.myHouse)]" :src="`/client-assets/mahjong/riichi.png`" style="display: block; width: 100%;"/>
				</Transition>
			</div>
			<div :class="$style.serifContainerOfMe">
				<Transition
					:enterActiveClass="$style.transition_serif_enterActive"
					:leaveActiveClass="$style.transition_serif_leaveActive"
					:enterFromClass="$style.transition_serif_enterFrom"
					:leaveToClass="$style.transition_serif_leaveTo"
				>
					<img v-if="ronSerifHouses[mj.myHouse]" :src="`/client-assets/mahjong/ron.png`" style="display: block; width: 100%;"/>
					<img v-else-if="ciiSerifHouses[mj.myHouse]" :src="`/client-assets/mahjong/cii.png`" style="display: block; width: 100%;"/>
					<img v-else-if="ponSerifHouses[mj.myHouse]" :src="`/client-assets/mahjong/pon.png`" style="display: block; width: 100%;"/>
					<img v-else-if="kanSerifHouses[mj.myHouse]" :src="`/client-assets/mahjong/kan.png`" style="display: block; width: 100%;"/>
					<img v-else-if="tsumoSerifHouses[mj.myHouse]" :src="`/client-assets/mahjong/tsumo.png`" style="display: block; width: 100%;"/>
					<img v-else-if="riichiSerifHouses[mj.myHouse]" :src="`/client-assets/mahjong/riichi.png`" style="display: block; width: 100%;"/>
				</Transition>
			</div>
		</div>

		<div :class="$style.startTextContainer">
			<Transition
				:enterActiveClass="$style.transition_serif_enterActive"
				:leaveActiveClass="$style.transition_serif_leaveActive"
				:enterFromClass="$style.transition_serif_enterFrom"
				:leaveToClass="$style.transition_serif_leaveTo"
			>
				<img v-if="startTextShowing" :src="`/client-assets/mahjong/kaisi.png`" style="display: block; width: 100%;"/>
			</Transition>
		</div>

		<div :class="$style.ryuukyokuContainer">
			<Transition
				:enterActiveClass="$style.transition_serif_enterActive"
				:leaveActiveClass="$style.transition_serif_leaveActive"
				:enterFromClass="$style.transition_serif_enterFrom"
				:leaveToClass="$style.transition_serif_leaveTo"
			>
				<img v-if="ryuukyokued" :src="`/client-assets/mahjong/ryuukyoku.png`" style="display: block; width: 100%;"/>
			</Transition>
		</div>

		<div :class="$style.actions" class="_buttons">
			<MkButton v-if="mj.canRon != null" primary gradate @click="ron">{{ i18n.ts._mahjong.ron }}</MkButton>
			<MkButton v-if="mj.canPon != null" primary @click="pon">{{ i18n.ts._mahjong.pon }}</MkButton>
			<MkButton v-if="mj.canCii != null" primary @click="cii">{{ i18n.ts._mahjong.cii }}</MkButton>
			<MkButton v-if="mj.canKan != null" primary @click="kan">{{ i18n.ts._mahjong.kan }}</MkButton>
			<MkButton v-if="mj.canRon != null || mj.canPon != null || mj.canCii != null || mj.canKan != null" @click="skip">{{ i18n.ts._mahjong.skip }}</MkButton>
			<MkButton v-if="isMyTurn && mj.canAnkan()" @click="ankan">{{ i18n.ts._mahjong.ankan }}</MkButton>
			<MkButton v-if="isMyTurn && mj.canKakan()" @click="kakan">{{ i18n.ts._mahjong.kakan }}</MkButton>
			<MkButton v-if="isMyTurn && canHora" primary gradate @click="tsumoHora">{{ i18n.ts._mahjong.tsumo }}</MkButton>
			<MkButton v-if="isMyTurn && mj.canRiichi()" primary @click="riichi">{{ i18n.ts._mahjong.riichi }}</MkButton>
		</div>
	</div>
	<div v-if="showKyokuResults" :class="$style.kyokuResult">
		<div :class="$style.kyokuResultCard">
			<div :class="$style.kyokuResultTitle">{{ roundLabel }} {{ ryuukyokued ? '流局' : '局結果' }}</div>
			<div v-if="ryuukyokued">
				<div v-for="house in houses" :key="house" :class="[$style.kyokuResultRow, $style.kyokuResultRowCompact]">
					<div :class="$style.kyokuResultHouseRow">
						<span :class="$style.kyokuResultHouse">{{ houseLabel(house) }}</span>
						<template v-if="houseToUser(house) != null">
							<MkAvatar :user="houseToUser(house)!" :class="$style.kyokuResultAvatar"/>
							<span :class="$style.kyokuResultName">{{ houseToUser(house)!.name ?? houseToUser(house)!.username }}</span>
						</template>
						<span v-else :class="$style.kyokuResultName">CPU</span>
						<span :class="[$style.kyokuResultJudgement, isTenpaiHouse(house) ? $style.kyokuResultTenpai : $style.kyokuResultNoten]">{{ isTenpaiHouse(house) ? i18n.ts._mahjong.tenpai : i18n.ts._mahjong.noten }}</span>
						<XAnimatedPoints :class="$style.kyokuResultAnimatedPoints" :value="mj.points[house]" :delta="getPointDelta(house)"/>
					</div>
				</div>
			</div>
			<div v-else>
				<div v-for="(res, house) in kyokuResults" :key="house">
					<div v-if="res != null" :class="$style.kyokuResultRow">
						<div :class="$style.kyokuResultHouseRow">
							<span :class="$style.kyokuResultHouse">{{ houseLabel(house) }}</span>
							<template v-if="houseToUser(house) != null">
								<MkAvatar :user="houseToUser(house)!" :class="$style.kyokuResultAvatar"/>
								<span :class="$style.kyokuResultName">{{ houseToUser(house)!.name ?? houseToUser(house)!.username }}</span>
							</template>
							<span v-else :class="$style.kyokuResultName">CPU</span>
							<XAnimatedPoints :class="$style.kyokuResultAnimatedPoints" :value="mj.points[house]" :delta="getPointDelta(house)"/>
						</div>
						<div v-for="yaku in res.yakus" :class="$style.kyokuResultYaku">
							<span>{{ (i18n.ts._mahjong._yakus as Record<string, string>)[yaku.name] }} {{ yaku.fan }}{{ i18n.ts._mahjong.fan }}</span>
						</div>
						<div :class="$style.kyokuResultYaku">{{ i18n.ts._mahjong.dora }} {{ res.doraCount }}{{ i18n.ts._mahjong.fan }}</div>
					</div>
				</div>
				<div :class="$style.kyokuResultSummary">
					<div v-for="house in houses" :key="`summary-${house}`" :class="$style.kyokuResultHouseRow">
						<span :class="$style.kyokuResultHouse">{{ houseLabel(house) }}</span>
						<template v-if="houseToUser(house) != null">
							<MkAvatar :user="houseToUser(house)!" :class="$style.kyokuResultAvatar"/>
							<span :class="$style.kyokuResultName">{{ houseToUser(house)!.name ?? houseToUser(house)!.username }}</span>
						</template>
						<span v-else :class="$style.kyokuResultName">CPU</span>
						<XAnimatedPoints :class="$style.kyokuResultAnimatedPoints" :value="mj.points[house]" :delta="getPointDelta(house)"/>
					</div>
				</div>
			</div>
			<div :class="$style.kyokuResultFooter">
				<div v-if="timerMode === 'confirm'" :class="$style.kyokuResultTimer">{{ i18n.ts._mahjong.nextKyokuConfirmation }} {{ i18n.tsx._mahjong.remainingSeconds({ n: myTurnTimerRmain }) }}</div>
				<MkButton primary @click="confirmKyokuResult">{{ i18n.ts._mahjong.confirm }}</MkButton>
			</div>
		</div>
	</div>
</div>
</template>

<script lang="ts" setup>
import { computed, onActivated, onDeactivated, onMounted, onUnmounted, reactive, ref, shallowRef, triggerRef } from 'vue';
import * as Misskey from 'misskey-js';
import * as Mmj from 'misskey-mahjong';
import { useInterval } from '@@/js/use-interval.js';
import XTile from './tile.vue';
import XHuro from './huro.vue';
import XHandTiles from './hand-tiles.vue';
import XAnimatedPoints from './animated-points.vue';
import MkButton from '@/components/MkButton.vue';
import { deepClone } from '@/utility/clone.js';
import { ensureSignin } from '@/i.js';
import { i18n } from '@/i18n.js';
import { useRouter } from '@/router.js';
import * as sound from '@/utility/sound.js';
import * as os from '@/os.js';

//#region syntax suger
function mj$(tid: Mmj.TileId): Mmj.TileInstance {
	return Mmj.findTileByIdOrFail(tid);
}

function mj$type(tid: Mmj.TileId): Mmj.TileType {
	return mj$(tid).t;
}

function tileTypeToTileId(type: Mmj.TileType): Mmj.TileId {
	for (const [id, tile] of Mmj.TILE_ID_MAP) {
		if (tile.t === type && tile.red !== true) return id;
	}
	throw new Error(`tile not found: ${type}`);
}
//#endregion

const $i = ensureSignin();
const router = useRouter();

const props = defineProps<{
	room: Misskey.entities.MahjongRoomDetailed;
	connection?: Misskey.IChannelConnection<Misskey.Channels['mahjongRoom']> | null;
}>();

const room = ref<Misskey.entities.MahjongRoomDetailed>(deepClone(props.room));
const myUserNumber = computed(() => room.value.user1Id === $i.id ? 1 : room.value.user2Id === $i.id ? 2 : room.value.user3Id === $i.id ? 3 : 4);
const mj = shallowRef(new Mmj.PlayerGameEngine(myUserNumber.value, room.value.gameState as unknown as Mmj.PlayerState));
const houses: Mmj.House[] = ['e', 's', 'w', 'n'];

const isMyTurn = computed(() => {
	return mj.value.turn === mj.value.myHouse;
});

const canHora = computed(() => {
	return isMyTurn.value && iTsumoed.value && mj.value.canTsumoHora();
});

const users = computed(() => ({
	e: houseToUser('e'),
	s: houseToUser('s'),
	w: houseToUser('w'),
	n: houseToUser('n'),
}));

const waitTiles = computed(() => mj.value.getWaitTiles());

const selectableTiles = ref<Mmj.TileType[] | null>(null);
const ronSerifHouses = reactive<Record<Mmj.House, boolean>>({ e: false, s: false, w: false, n: false });
const ciiSerifHouses = reactive<Record<Mmj.House, boolean>>({ e: false, s: false, w: false, n: false });
const ponSerifHouses = reactive<Record<Mmj.House, boolean>>({ e: false, s: false, w: false, n: false });
const kanSerifHouses = reactive<Record<Mmj.House, boolean>>({ e: false, s: false, w: false, n: false });
const tsumoSerifHouses = reactive<Record<Mmj.House, boolean>>({ e: false, s: false, w: false, n: false });
const riichiSerifHouses = reactive<Record<Mmj.House, boolean>>({ e: false, s: false, w: false, n: false });
const iTsumoed = ref(false);
const showKyokuResults = ref(false);
const kyokuResults = ref<Record<Mmj.House, {
	yakus: {
		name: string;
		fan: number | null;
		isYakuman?: boolean;
	}[];
	doraCount: number;
	pointDeltas: Record<Mmj.House, number>;
} | null>>({
	e: null,
	s: null,
	w: null,
	n: null,
});
const ryuukyokued = ref(false);
const ryuukyokuResult = ref<{
	tenpaiHouses: Mmj.House[];
	notenHouses: Mmj.House[];
	pointDeltas: Record<Mmj.House, number>;
} | null>(null);
const startTextShowing = ref(false);

/*
if (room.value.isStarted && !room.value.isEnded) {
	useInterval(() => {
		if (room.value.isEnded) return;
		const crc32 = mj.value.calcCrc32();
		if (_DEV_) console.log('crc32', crc32);
		misskeyApi('reversi/verify', {
			roomId: room.value.id,
			crc32: crc32.toString(),
		}).then((res) => {
			if (res.desynced) {
				console.log('resynced');
				restoreRoom(res.room!);
			}
		});
	}, 10000, { immediate: false, afterMounted: true });
}
*/

const CALL_SEC = Mmj.CALL_AND_RON_ASKING_TIMEOUT_MS / 1000;
const NEXT_KYOKU_SEC = Mmj.NEXT_KYOKU_CONFIRMATION_TIMEOUT_MS / 1000;

type TimerMode = 'turn' | 'call' | 'confirm' | 'hidden';

/**
 * 鳴き・ロンの回答を求められているかどうか
 */
const hasCall = computed(() => {
	return mj.value.canRon != null || mj.value.canPon != null || mj.value.canCii != null || mj.value.canKan != null;
});

/**
 * 鳴き・ロンの確認対象となっている捨て牌の家
 */
const callTargetHouse = computed<Mmj.House | null>(() => {
	return mj.value.canRon?.callee
		?? mj.value.canPon?.callee
		?? mj.value.canCii?.callee
		?? mj.value.canKan?.callee
		?? null;
});

function isCallTarget(house: Mmj.House, index: number, length: number): boolean {
	return callTargetHouse.value === house && index === length - 1;
}

const timerMode = ref<TimerMode>('turn');
const timerDeadline = ref<number>(0);
const myTurnTimerRmain = ref<number>(room.value.timeLimitForEachTurn);

function updateTimerRemaining() {
	myTurnTimerRmain.value = Math.max(0, Math.ceil((timerDeadline.value - Date.now()) / 1000));
}

function startTimer(seconds: number, mode: TimerMode) {
	timerMode.value = mode;
	if (mode === 'hidden') {
		timerDeadline.value = 0;
		myTurnTimerRmain.value = 0;
		return;
	}
	timerDeadline.value = Date.now() + seconds * 1000;
	myTurnTimerRmain.value = Math.max(0, Math.ceil(seconds));
}

function hideTimer() {
	startTimer(0, 'hidden');
}

function resetTurnTimer() {
	startTimer(room.value.timeLimitForEachTurn, 'turn');
}

// 初期表示が0にならないよう、初期状態から期限を設定する
if (hasCall.value) {
	startTimer(CALL_SEC, 'call');
} else {
	resetTurnTimer();
}

useInterval(() => {
	if (room.value.isEnded || timerMode.value === 'hidden') return;
	updateTimerRemaining();
}, 250, { immediate: false, afterMounted: true });

const timerVisible = computed(() => {
	if (room.value.isEnded) return false;
	switch (timerMode.value) {
		case 'turn':
			return isMyTurn.value;
		case 'call':
			return hasCall.value;
		default:
			return false;
	}
});

const timerLabel = computed(() => {
	const remaining = i18n.tsx._mahjong.remainingSeconds({ n: myTurnTimerRmain.value });
	return timerMode.value === 'call'
		? `${i18n.ts._mahjong.callConfirmation} ${remaining}`
		: remaining;
});

/*
const TIMER_INTERVAL_SEC = 3;
if (!props.room.isEnded) {
	useInterval(() => {
		if (myTurnTimerRmain.value > 0) {
			myTurnTimerRmain.value = Math.max(0, myTurnTimerRmain.value - TIMER_INTERVAL_SEC);
		}
		if (opTurnTimerRmain.value > 0) {
			opTurnTimerRmain.value = Math.max(0, opTurnTimerRmain.value - TIMER_INTERVAL_SEC);
		}

		if (iAmPlayer.value) {
			if ((isMyTurn.value && myTurnTimerRmain.value === 0) || (!isMyTurn.value && opTurnTimerRmain.value === 0)) {
			props.connection!.send('claimTimeIsUp', {});
			}
		}
	}, TIMER_INTERVAL_SEC * 1000, { immediate: false, afterMounted: true });
}
*/

function houseToUser(house: Mmj.House) {
	return mj.value.user1House === house ? room.value.user1 : mj.value.user2House === house ? room.value.user2 : mj.value.user3House === house ? room.value.user3 : room.value.user4;
}

function houseLabel(house: Mmj.House): string {
	return house === 'e' ? i18n.ts._mahjong.east : house === 's' ? i18n.ts._mahjong.south : house === 'w' ? i18n.ts._mahjong.west : i18n.ts._mahjong.north;
}

const roundLabel = computed(() => {
	return `${houseLabel(mj.value.round)}${i18n.tsx._mahjong.kyoku({ n: mj.value.kyoku })}`;
});

function isTenpaiHouse(house: Mmj.House): boolean {
	return ryuukyokuResult.value?.tenpaiHouses.includes(house) ?? false;
}

function getPointDelta(house: Mmj.House): number {
	if (ryuukyokued.value) {
		return ryuukyokuResult.value?.pointDeltas[house] ?? 0;
	}

	let delta = 0;
	for (const res of Object.values(kyokuResults.value)) {
		if (res != null) delta += res.pointDeltas[house];
	}
	return delta;
}

function backToLobby() {
	router.push('/mahjong');
}

let riichiSelect = false;
let ankanSelect = false;
let kakanSelect = false;
let ciiSelect = false;

function chooseTile(tile: Mmj.TileId, ev: MouseEvent) {
	if (!isMyTurn.value) return;

	iTsumoed.value = false;

	if (ankanSelect) {
		props.connection!.send('ankan', {
			tile: tile,
		});
		ankanSelect = false;
		selectableTiles.value = null;
		return;
	} else if (kakanSelect) {
		props.connection!.send('kakan', {
			tile: tile,
		});
		kakanSelect = false;
		selectableTiles.value = null;
		return;
	} else if (ciiSelect) {
		return;
	}

	props.connection!.send('dahai', {
		tile: tile,
		riichi: riichiSelect,
	});

	riichiSelect = false;
	selectableTiles.value = null;
}

function riichi() {
	if (!isMyTurn.value) return;

	riichiSelect = true;
	selectableTiles.value = Mmj.getTilesForRiichi(mj.value.myHandTileTypes);
	console.log(Mmj.getTilesForRiichi(mj.value.myHandTileTypes));
}

function ankan() {
	if (!isMyTurn.value) return;

	ankanSelect = true;
	selectableTiles.value = mj.value.getAnkanableTiles().map(id => mj$type(id));
}

function kakan() {
	if (!isMyTurn.value) return;

	kakanSelect = true;
	selectableTiles.value = mj.value.getKakanableTiles().map(id => mj$type(id));
}

function tsumoHora() {
	if (!isMyTurn.value) return;

	props.connection!.send('tsumoHora', {
	});
}

/**
 * ロン・ポン・チー・カンのいずれかを選択したら、残りの選択肢をローカルでも消す。
 * 送信後に skip を押して回答を上書きできないようにする。
 */
function clearCalls() {
	mj.value.commit_nop();
	triggerRef(mj);
}

function ron() {
	props.connection!.send('ronHora', {
	});
	clearCalls();
	hideTimer();
}

function pon() {
	props.connection!.send('pon', {
	});
	clearCalls();
	hideTimer();
}

function cii(ev: MouseEvent) {
	const targetTile = mj.value.hoTiles[mj.value.canCii!.callee].at(-1)!;
	const patterns = Mmj.getAvailableCiiPatterns(mj.value.myHandTileTypes, mj$type(targetTile));
	os.popupMenu(patterns.map(pattern => ({
		text: pattern.join(' '),
		action: () => {
			const index = Mmj.sortTileTypes(pattern).indexOf(mj$type(targetTile));
			props.connection!.send('cii', {
				pattern: index === 0 ? 'x__' : index === 1 ? '_x_' : '__x',
			});
			clearCalls();
			hideTimer();
		},
	})), ev.currentTarget ?? ev.target);
}

function kan() {
	props.connection!.send('kan', {
	});
	clearCalls();
	hideTimer();
}

function skip() {
	clearCalls();

	props.connection!.send('nop', {});
	hideTimer();
}

function confirmKyokuResult() {
	props.connection!.send('confirmNextKyoku', {});
	hideTimer();
}

function onStreamDahai(log: { house: Mmj.House; tile: number; riichi: boolean }) {
	console.log('onStreamDahai', log);

	sound.playUrl('/client-assets/mahjong/dahai.mp3', {
		volume: 1,
		playbackRate: 1,
	});

	//if (log.house !== mj.value.state.turn) { // = desyncが発生している
	//	const _room = await misskeyApi('mahjong/show-room', {
	//		roomId: props.room.id,
	//	});
	//	restoreRoom(_room);
	//	return;
	//}

	mj.value.commit_dahai(log.house, log.tile, log.riichi);
	triggerRef(mj);

	riichiSerifHouses[log.house] = log.riichi;
	window.setTimeout(() => {
		riichiSerifHouses[log.house] = false;
	}, 2000);

	if (hasCall.value) {
		startTimer(CALL_SEC, 'call');
	} else {
		hideTimer();
	}
}

function onStreamTsumo(log: { house: Mmj.House; tile: number }) {
	console.log('onStreamTsumo', log);

	//if (log.house !== mj.value.state.turn) { // = desyncが発生している
	//	const _room = await misskeyApi('mahjong/show-room', {
	//		roomId: props.room.id,
	//	});
	//	restoreRoom(_room);
	//	return;
	//}

	mj.value.commit_tsumo(log.house, log.tile);
	triggerRef(mj);

	if (log.house === mj.value.myHouse) {
		iTsumoed.value = true;
	}

	resetTurnTimer();
}

function onStreamDahaiAndTsumo(log: { dahaiHouse: Mmj.House; dahaiTile: number; tsumoTile: number; riichi: boolean }) {
	console.log('onStreamDahaiAndTsumo', log);

	//if (log.house !== mj.value.state.turn) { // = desyncが発生している
	//	const _room = await misskeyApi('mahjong/show-room', {
	//		roomId: props.room.id,
	//	});
	//	restoreRoom(_room);
	//	return;
	//}

	sound.playUrl('/client-assets/mahjong/dahai.mp3', {
		volume: 1,
		playbackRate: 1,
	});

	mj.value.commit_dahai(log.dahaiHouse, log.dahaiTile, log.riichi);
	triggerRef(mj);

	riichiSerifHouses[log.dahaiHouse] = log.riichi;
	window.setTimeout(() => {
		riichiSerifHouses[log.dahaiHouse] = false;
	}, 2000);

	window.setTimeout(() => {
		mj.value.commit_tsumo(Mmj.nextHouse(log.dahaiHouse), log.tsumoTile);
		triggerRef(mj);

		if (Mmj.nextHouse(log.dahaiHouse) === mj.value.myHouse) {
			iTsumoed.value = true;
		}
	}, 100);

	resetTurnTimer();
}

function onStreamPonned(log: { caller: Mmj.House; callee: Mmj.House; tiles: readonly [number, number, number] }) {
	console.log('onStreamPonned', log);

	//if (log.house !== mj.value.state.turn) { // = desyncが発生している
	//	const _room = await misskeyApi('mahjong/show-room', {
	//		roomId: props.room.id,
	//	});
	//	restoreRoom(_room);
	//	return;
	//}

	mj.value.commit_pon(log.caller, log.callee, log.tiles);
	triggerRef(mj);

	ponSerifHouses[log.caller] = true;
	window.setTimeout(() => {
		ponSerifHouses[log.caller] = false;
	}, 2000);

	resetTurnTimer();
}

function onStreamKanned(log: { caller: Mmj.House; callee: Mmj.House; tiles: readonly [number, number, number, number]; rinsyan: number; doraIndicateTiles: number[] }) {
	console.log('onStreamKanned', log);

	mj.value.commit_kan(log.caller, log.callee, log.tiles, log.rinsyan, log.doraIndicateTiles);
	triggerRef(mj);

	if (log.caller === mj.value.myHouse) iTsumoed.value = true;

	kanSerifHouses[log.caller] = true;
	window.setTimeout(() => {
		kanSerifHouses[log.caller] = false;
	}, 2000);

	resetTurnTimer();
}

function onStreamKakanned(log: { house: Mmj.House; tiles: readonly [number, number, number, number]; rinsyan: number; from: Mmj.House; doraIndicateTiles: number[] }) {
	console.log('onStreamKakanned', log);

	mj.value.commit_kakan(log.house, log.tiles, log.rinsyan, log.doraIndicateTiles);
	triggerRef(mj);

	if (log.house === mj.value.myHouse) iTsumoed.value = true;

	kanSerifHouses[log.house] = true;
	window.setTimeout(() => {
		kanSerifHouses[log.house] = false;
	}, 2000);

	resetTurnTimer();
}

function onStreamAnkanned(log: { house: Mmj.House; tiles: readonly [number, number, number, number]; rinsyan: number; doraIndicateTiles: number[] }) {
	console.log('onStreamAnkanned', log);

	mj.value.commit_ankan(log.house, log.tiles, log.rinsyan, log.doraIndicateTiles);
	triggerRef(mj);

	if (log.house === mj.value.myHouse) iTsumoed.value = true;

	kanSerifHouses[log.house] = true;
	window.setTimeout(() => {
		kanSerifHouses[log.house] = false;
	}, 2000);

	resetTurnTimer();
}

function onStreamCiied(log: { caller: Mmj.House; callee: Mmj.House; tiles: readonly [number, number, number] }) {
	console.log('onStreamCiied', log);

	mj.value.commit_cii(log.caller, log.callee, log.tiles);
	triggerRef(mj);

	ciiSerifHouses[log.caller] = true;
	window.setTimeout(() => {
		ciiSerifHouses[log.caller] = false;
	}, 2000);

	resetTurnTimer();
}

function onStreamRonned(log: { callers: Mmj.House[]; callee: Mmj.House; handTiles: Record<Mmj.House, number[]> }) {
	console.log('onStreamRonned', log);

	const res = mj.value.commit_ronHora(log.callers, log.callee, log.handTiles);
	triggerRef(mj);

	kyokuResults.value = res;

	window.setTimeout(() => {
		showKyokuResults.value = true;
	}, 1500);

	for (const caller of log.callers) {
		ronSerifHouses[caller] = true;

		window.setTimeout(() => {
			ronSerifHouses[caller] = false;
		}, 2000);
	}

	console.log('ronned', res);

	startTimer(NEXT_KYOKU_SEC, 'confirm');
}

function onStreamTsumoHora(log: { house: Mmj.House; handTiles: number[]; tsumoTile: number }) {
	console.log('onStreamTsumoHora', log);

	const res = mj.value.commit_tsumoHora(log.house, log.handTiles, log.tsumoTile);
	triggerRef(mj);

	kyokuResults.value[log.house] = res;

	window.setTimeout(() => {
		showKyokuResults.value = true;
	}, 1500);

	tsumoSerifHouses[log.house] = true;
	window.setTimeout(() => {
		tsumoSerifHouses[log.house] = false;
	}, 2000);

	console.log('tsumohora', res);

	startTimer(NEXT_KYOKU_SEC, 'confirm');
}

function onStreamRyuukyoku(log: { tenpaiHouses: Mmj.House[]; notenHouses: Mmj.House[]; pointDeltas: Record<Mmj.House, number> }) {
	console.log('onStreamRyuukyoku', log);

	ryuukyokuResult.value = log;
	mj.value.commit_ryuukyoku(log.pointDeltas);
	triggerRef(mj);

	ryuukyokued.value = true;

	window.setTimeout(() => {
		showKyokuResults.value = true;
	}, 1500);

	startTimer(NEXT_KYOKU_SEC, 'confirm');
}

function onStreamNextKyoku(log: { room: Misskey.entities.MahjongRoomDetailed }) {
	console.log('onStreamNextKyoku', log);

	room.value = log.room;
	mj.value.commit_nextKyoku(log.room.gameState as unknown as Mmj.PlayerState);
	triggerRef(mj);

	iTsumoed.value = false;
	showKyokuResults.value = false;
	kyokuResults.value = {
		e: null,
		s: null,
		w: null,
		n: null,
	};
	ryuukyokued.value = false;
	ryuukyokuResult.value = null;

	resetTurnTimer();
}

function onStreamEnded(log: { room: Misskey.entities.MahjongRoomDetailed }) {
	room.value = log.room;
	if (room.value.gameState != null) {
		mj.value = new Mmj.PlayerGameEngine(myUserNumber.value, room.value.gameState as unknown as Mmj.PlayerState);
		triggerRef(mj);
	}
	showKyokuResults.value = false;
	hideTimer();
}

let listening = false;

function attachListeners() {
	if (listening || props.connection == null) return;
	listening = true;
	props.connection.on('dahai', onStreamDahai);
	props.connection.on('tsumo', onStreamTsumo);
	props.connection.on('dahaiAndTsumo', onStreamDahaiAndTsumo);
	props.connection.on('ponned', onStreamPonned);
	props.connection.on('kanned', onStreamKanned);
	props.connection.on('kakanned', onStreamKakanned);
	props.connection.on('ankanned', onStreamAnkanned);
	props.connection.on('ciied', onStreamCiied);
	props.connection.on('ronned', onStreamRonned);
	props.connection.on('tsumoHora', onStreamTsumoHora);
	props.connection.on('ryuukyoku', onStreamRyuukyoku);
	props.connection.on('nextKyoku', onStreamNextKyoku);
	props.connection.on('ended', onStreamEnded);
}

function detachListeners() {
	if (!listening || props.connection == null) return;
	listening = false;
	props.connection.off('dahai', onStreamDahai);
	props.connection.off('tsumo', onStreamTsumo);
	props.connection.off('dahaiAndTsumo', onStreamDahaiAndTsumo);
	props.connection.off('ponned', onStreamPonned);
	props.connection.off('kanned', onStreamKanned);
	props.connection.off('kakanned', onStreamKakanned);
	props.connection.off('ankanned', onStreamAnkanned);
	props.connection.off('ciied', onStreamCiied);
	props.connection.off('ronned', onStreamRonned);
	props.connection.off('tsumoHora', onStreamTsumoHora);
	props.connection.off('ryuukyoku', onStreamRyuukyoku);
	props.connection.off('nextKyoku', onStreamNextKyoku);
	props.connection.off('ended', onStreamEnded);
}

onMounted(attachListeners);
onActivated(attachListeners);
onDeactivated(detachListeners);
onUnmounted(detachListeners);

</script>

<style lang="scss" module>
@keyframes shine {
	0% { translate: -30px; }
	100% { translate: -130px; }
}

.transition_serif_enterActive,
.transition_serif_leaveActive {
	transition: opacity 0.1s linear, scale 0.1s linear;
}
.transition_serif_enterFrom {
	scale: 1.25;
	opacity: 0;
}
.transition_serif_leaveTo {
	opacity: 0;
}

.root {
	background: #3C7A43;
	background-image: url('/client-assets/mahjong/bg.jpg');
	background-size: cover;
	background-position: center;
	background-repeat: no-repeat;
	padding: 30px;
}

.taku {
	position: relative;
	width: 100%;
	height: 100%;
	max-width: 600px;
	min-height: 600px;
	margin: auto;
	box-sizing: border-box;
}

.kyokuResult {
	position: fixed;
	top: 0;
	left: 0;
	right: 0;
	bottom: 0;
	z-index: 1000;
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 16px;
	box-sizing: border-box;
	background: color-mix(in srgb, var(--MI_THEME-bg) 60%, transparent);
}

.kyokuResultCard {
	width: min(480px, 100%);
	max-height: 88vh;
	overflow: auto;
	box-sizing: border-box;
	padding: 24px;
	background: var(--MI_THEME-panel);
	color: var(--MI_THEME-fg);
	border-radius: var(--MI-radius);
	box-shadow: 0 8px 32px #000a;
}

.kyokuResultTitle {
	margin-bottom: 16px;
	font-size: 1.4em;
	font-weight: bold;
	text-align: center;
}

.kyokuResultRow {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 12px 0;
	border-top: solid 1px var(--MI_THEME-divider);

	&:first-child {
		border-top: none;
	}
}

.kyokuResultHouseRow {
	display: flex;
	align-items: center;
	gap: 8px;
	font-weight: bold;
}

.kyokuResultHouse {
	min-width: 2em;
}

.kyokuResultAvatar {
	width: 24px;
	height: 24px;
}

.kyokuResultName {
	flex: 1;
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.kyokuResultYaku {
	font-size: 90%;
	opacity: 0.9;
}

.kyokuResultAnimatedPoints {
	margin-left: auto;
	flex-shrink: 0;
}

.kyokuResultSummary {
	margin-top: 12px;
	padding-top: 8px;
	border-top: solid 2px var(--MI_THEME-divider);
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.kyokuResultRowCompact {
	gap: 0;
}

.kyokuResultEndPoints {
	margin-left: auto;
	font-weight: bold;
	white-space: nowrap;
}

.kyokuResultJudgement {
	flex-shrink: 0;
	padding: 1px 6px;
	border-radius: 4px;
	font-size: 80%;
	white-space: nowrap;
}

.kyokuResultTenpai {
	background: var(--MI_THEME-accentedBg);
	color: var(--MI_THEME-accent);
}

.kyokuResultNoten {
	background: color-mix(in srgb, var(--MI_THEME-fg) 10%, transparent);
	opacity: 0.75;
}

.kyokuResultFooter {
	display: flex;
	justify-content: center;
	margin-top: 16px;
}

.kyokuResultTimer {
	margin: 16px 0;
	font-size: 1.1em;
}

.centerPanel {
	position: absolute;
	top: 0;
	left: 0;
	right: 0;
	bottom: 0;
	display: grid;
	place-items: center;
	width: 150px;
	height: 150px;
	margin: auto;
	scale: 0.9;
	background: #333;
	border: solid 1px #888;
	border-radius: 10px;
	box-shadow: 0 4px 10px #000a;
}
.centerPanelTickerToi {
	position: absolute;
	width: 100%;
	height: 100%;
	top: 0;
	left: 0;
	bottom: 0;
	right: 0;
	rotate: 180deg;
}
.centerPanelTickerKami {
	position: absolute;
	width: 100%;
	height: 100%;
	top: 0;
	left: 0;
	bottom: 0;
	right: 0;
	rotate: 90deg;
}
.centerPanelTickerSimo {
	position: absolute;
	width: 100%;
	height: 100%;
	top: 0;
	left: 0;
	bottom: 0;
	right: 0;
	rotate: -90deg;
}
.centerPanelTickerMe {
	position: absolute;
	width: 100%;
	height: 100%;
	top: 0;
	left: 0;
	bottom: 0;
	right: 0;
}
.centerPanelHouse {
	font-weight: bold;
}
.centerPanelPoint {
	margin-left: 10px;
}

.centerPanelContent {
	position: relative;
	z-index: 1;
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 2px;
}

.waitTiles {
	display: flex;
	flex-direction: column;
	align-items: center;
	max-width: 150px;
}

.waitTilesLabel {
	color: #fff;
	font-size: 60%;
	opacity: 0.8;
	text-shadow: 0 1px 2px #000;
	white-space: nowrap;
	flex-shrink: 0;
}

.waitTilesList {
	display: flex;
	flex-wrap: wrap;
	justify-content: center;
	max-width: 140px;
}

.statusBar {
	position: relative;
	z-index: 10;
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	width: 100%;
	max-width: 600px;
	min-height: 44px;
	margin: 0 auto 8px;
}

.statusBarLeft {
	display: flex;
	align-items: center;
	gap: 8px;
	min-width: 0;
}

.roundInfo {
	padding: 4px 12px;
	background: color-mix(in srgb, black 55%, transparent);
	color: #fff;
	border-radius: 999px;
	font-size: 80%;
	font-weight: bold;
	white-space: nowrap;
	pointer-events: none;
}

.turnTimer {
	width: min-content;
	padding: 4px 12px;
	background: color-mix(in srgb, black 55%, transparent);
	color: #fff;
	border-radius: 999px;
	font-size: 80%;
	white-space: nowrap;
	pointer-events: none;
}

.doraIndicators {
	display: flex;
	align-items: center;
	gap: 4px;
	margin-left: auto;
	pointer-events: none;
}

.doraIndicatorLabel {
	color: #fff;
	font-size: 80%;
	margin-right: 4px;
	text-shadow: 0 1px 2px #000;
	white-space: nowrap;
	flex-shrink: 0;
}
.centerPanelIndicatorContainerToi {
	position: absolute;
	width: 100%;
	height: 100%;
	top: 0;
	left: 0;
	bottom: 0;
	right: 0;
	margin: auto;
	rotate: 180deg;
}
.centerPanelIndicatorContainerKami {
	position: absolute;
	width: 100%;
	height: 100%;
	top: 0;
	left: 0;
	bottom: 0;
	right: 0;
	margin: auto;
	rotate: 90deg;
}
.centerPanelIndicatorContainerSimo {
	position: absolute;
	width: 100%;
	height: 100%;
	top: 0;
	left: 0;
	bottom: 0;
	right: 0;
	margin: auto;
	rotate: -90deg;
}
.centerPanelIndicatorContainerMe {
	position: absolute;
	width: 100%;
	height: 100%;
	top: 0;
	left: 0;
	bottom: 0;
	right: 0;
	margin: auto;
}
.centerPanelIndicator {
	position: absolute;
	top: 0;
	left: 0;
	bottom: 0;
	right: 0;
	margin: auto;
	width: 100px;
	height: 10px;
	border-radius: 999px;
}
.centerPanelIndicatorIndicated {
	background: #ff0;
}

.handTilesOfToimen {
	position: absolute;
	top: 48px;
	right: 40px;
}
.handTileImgOfToimen {
	display: inline-block;
	vertical-align: bottom;
	width: 32px;
}

.handTilesOfKamitya {
	position: absolute;
	top: 80px;
	left: 0;
}

.handTilesOfSimotya {
	position: absolute;
	bottom: 80px;
	right: 0;
}

.handTilesOfMe {
	position: absolute;
	bottom: 0;
	left: 0px;
}

.huroTilesOfMe {
	position: absolute;
	bottom: 56px;
	right: 8px;
}

.huroTilesOfToimen {
	position: absolute;
	top: 48px;
	left: 8px;
}

.huroTilesOfKamitya {
	position: absolute;
	top: 80px;
	left: 40px;
}

.huroTilesOfSimotya {
	position: absolute;
	top: 80px;
	right: 0;
}

.hoTilesContainer {
	position: absolute;
	top: 0;
	bottom: 0;
	left: 0;
	right: 0;
	transform-origin: center;
	scale: 0.8;
}

.hoTilesContainerOfToimen {
	position: absolute;
	bottom: calc(50% + 125px);
	left: 0;
	right: 0;
	margin: auto;
	width: min-content;
}
.hoTilesOfToimen {
	rotate: 180deg;
	display: grid;
	grid-template-columns: 1fr 1fr 1fr 1fr 1fr 1fr;
}

.hoTilesContainerOfKamitya {
	position: absolute;
	right: calc(50% + 125px);
	top: 0;
	bottom: 0;
	margin: auto;
	height: min-content;
}
.hoTilesOfKamitya {
	rotate: 90deg;
	display: grid;
	grid-template-columns: 1fr 1fr 1fr 1fr 1fr 1fr;
	grid-template-rows: 1fr 1fr 1fr 1fr 1fr 1fr;
	aspect-ratio: 1;
}

.hoTilesContainerOfSimotya {
	position: absolute;
	left: calc(50% + 125px);
	top: 0;
	bottom: 0;
	margin: auto;
	height: min-content;
}
.hoTilesOfSimotya {
	rotate: -90deg;
	display: grid;
	grid-template-columns: 1fr 1fr 1fr 1fr 1fr 1fr;
	grid-template-rows: 1fr 1fr 1fr 1fr 1fr 1fr;
	aspect-ratio: 1;
}

.hoTilesContainerOfMe {
	position: absolute;
	top: calc(50% + 125px);
	left: 0;
	right: 0;
	margin: auto;
	width: min-content;
}
.hoTilesOfMe {
	display: grid;
	grid-template-columns: 1fr 1fr 1fr 1fr 1fr 1fr;
}

.playersContainer {
	position: absolute;
	top: 0;
	bottom: 0;
	left: 0;
	right: 0;
	z-index: 100;
	pointer-events: none;
}
.player {
	position: absolute;
	display: flex;
	align-items: center;
	gap: 8px;
	margin: auto;
	width: auto;
	max-width: 170px;
	height: min-content;
	padding: 6px 10px;
	box-sizing: border-box;
	background: color-mix(in srgb, black 55%, transparent);
	color: #fff;
	border-radius: 5px;
	font-size: 80%;
	z-index: 110;
}
.playerName {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.playerHouse {
	flex-shrink: 0;
	opacity: 0.75;
	font-size: 80%;
	font-weight: bold;
}
.playerOfToimen {
	top: 8px;
	left: 0;
	right: 0;
	margin: auto;
}
.playerOfKamitya {
	top: 8px;
	left: 8px;
	bottom: auto;
	margin: 0;
}
.playerOfSimotya {
	top: 8px;
	right: 8px;
	bottom: auto;
	margin: 0;
}
.playerOfMe {
	bottom: 64px;
	left: 8px;
	margin: 0;
}

.serifContainer {
	position: absolute;
	top: 0;
	bottom: 0;
	left: 0;
	right: 0;
	z-index: 90;
	pointer-events: none;
}
.serifContainerOfKamitya {
	position: absolute;
	top: 0;
	bottom: 0;
	left: 56px;
	margin: auto;
	width: 150px;
	height: min-content;
	filter: drop-shadow(0 2px 4px #000c);
}
.serifContainerOfSimotya {
	position: absolute;
	top: 0;
	bottom: 0;
	right: 56px;
	margin: auto;
	width: 150px;
	height: min-content;
	filter: drop-shadow(0 2px 4px #000c);
}
.serifContainerOfToimen {
	position: absolute;
	top: 36px;
	left: 0;
	right: 0;
	margin: auto;
	width: 150px;
	height: min-content;
	filter: drop-shadow(0 2px 4px #000c);
}
.serifContainerOfMe {
	position: absolute;
	bottom: 70px;
	left: 0;
	right: 0;
	margin: auto;
	width: 150px;
	height: min-content;
	filter: drop-shadow(0 2px 4px #000c);
}

.ryuukyokuContainer {
	position: absolute;
	top: 0;
	bottom: 0;
	left: 0;
	right: 0;
	width: 200px;
	height: min-content;
	margin: auto;
	z-index: 100;
	pointer-events: none;
}

.sideTile {
	margin-bottom: -26px;
}

.hoTile {
	position: relative;
	display: inline-block;
	margin-bottom: -8px;
}

.callTarget {
	z-index: 100 !important;
	outline: 2px solid #ffd54f;
	outline-offset: 2px;
	border-radius: 4px;
	animation: callTargetBlink 900ms ease-in-out infinite;
}

@keyframes callTargetBlink {
	0%, 100% {
		filter: brightness(1);
		scale: 1;
		box-shadow: 0 0 0 0 transparent;
	}

	50% {
		filter: brightness(1.6);
		scale: 1.08;
		box-shadow: 0 0 12px 3px #ffd54f;
	}
}

@media (prefers-reduced-motion: reduce) {
	.callTarget {
		animation: none;
		filter: brightness(1.15);
		scale: 1;
		box-shadow: 0 0 8px 2px #ffd54f;
	}
}

.actions {
	position: absolute;
	bottom: 76px;
	left: 0;
	right: 0;
	z-index: 200;
	display: flex;
	justify-content: center;
	flex-wrap: wrap;
}

@media (max-width: 520px) {
	.root {
		padding: 8px;
		min-height: 100vh;
		min-height: 100dvh;
		box-sizing: border-box;
		overflow-x: hidden;
	}

	.player {
		max-width: 120px;
	}

	.handTilesOfMe {
		scale: 0.72;
		transform-origin: bottom left;
	}

	.handTilesOfToimen {
		right: 8px;
		scale: 0.55;
		transform-origin: top right;
	}

	.hoTilesContainerOfKamitya {
		right: calc(50% + 80px);
	}

	.hoTilesContainerOfSimotya {
		left: calc(50% + 80px);
	}

	.huroTilesOfMe {
		bottom: 120px;
		right: 8px;
	}
}
</style>
